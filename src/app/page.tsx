'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { FinOpsMetricsBar } from '@/components/FinOpsMetricsBar';
import { WaveformMonitor } from '@/components/WaveformMonitor';
import { HardwareControlRig } from '@/components/HardwareControlRig';
import { AgentTracePanel } from '@/components/AgentTracePanel';
import {
  applyActuationToTwin,
  createInitialTwinState,
  DigitalTwinInternalState,
  injectFault,
  resetFault,
  stepDigitalTwin,
} from '@/lib/digital-twin';
import {
  ActuationCommand,
  AgentTraceEvent,
  FaultMode,
  FinOpsStats,
  OperatingMode,
  TavilyDatasheetCitation,
  TelemetryFrame,
  TriageStatus,
} from '@/lib/types';

export default function CommandCenterPage() {
  const [twinState, setTwinState] = useState<DigitalTwinInternalState>(createInitialTwinState);
  const [currentFrame, setCurrentFrame] = useState<TelemetryFrame | null>(null);
  const [history, setHistory] = useState<TelemetryFrame[]>([]);
  const [status, setStatus] = useState<TriageStatus>('NOMINAL');
  const [isStreaming, setIsStreaming] = useState(true);
  const [lastCommand, setLastCommand] = useState<ActuationCommand | null>(null);
  const [citations, setCitations] = useState<TavilyDatasheetCitation[]>([]);
  const [traces, setTraces] = useState<AgentTraceEvent[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [finops, setFinops] = useState<FinOpsStats>({
    tier1Calls: 0,
    tier2Calls: 0,
    totalFramesProcessed: 0,
    filteredNominalPercent: 100,
    estimatedCostSavingsUsd: 0,
    averageTriageLatencyMs: 42,
    activeTier1Model: 'nvidia/Nemotron-3-Nano-30B',
    activeTier2Model: 'nvidia/Nemotron-3-Ultra-550b-a55b',
    inferenceSource: 'FALLBACK_SIM',
  });

  const twinRef = useRef<DigitalTwinInternalState>(twinState);
  twinRef.current = twinState;

  const currentFrameRef = useRef<TelemetryFrame | null>(currentFrame);
  currentFrameRef.current = currentFrame;

  const isRecoveringRef = useRef(isRecovering);
  isRecoveringRef.current = isRecovering;

  // Automated closed-loop anomaly recovery pipeline (Steps 2, 3, and 4)
  const triggerClosedLoopRecovery = useCallback(
    async (
      frame: TelemetryFrame,
      triageAssessment: { status: TriageStatus; faultSignature: string; targetComponent: string }
    ) => {
      if (isRecoveringRef.current) return;
      setIsRecovering(true);
      isRecoveringRef.current = true;
      setApiError(null);

      try {
        // Step 2 & 3: Tavily Datasheet Grounding + Nebius Ultra Policy Synthesis
        const diagRes = await fetch('/api/diagnose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frame,
            triage: triageAssessment,
          }),
        });

        if (!diagRes.ok) throw new Error('Diagnosis endpoint returned an error');
        const diagData = await diagRes.json();

        if (diagData.citations) {
          setCitations(diagData.citations);
        }

        const candidateCommand: ActuationCommand = diagData.candidateCommand;

        // Step 4: Sandbox State-Space Verification & Actuation Dispatch
        const simRes = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frame,
            candidateCommand,
          }),
        });

        if (!simRes.ok) throw new Error('Simulation verifier endpoint returned an error');
        const simData = await simRes.json();

        if (simData.verifiedCommand && simData.simulation?.verified) {
          setLastCommand(simData.verifiedCommand);

          // Apply corrective actuation to the Digital Twin state
          setTwinState((prev) => {
            const updated = applyActuationToTwin(prev, simData.verifiedCommand);
            twinRef.current = updated;
            return updated;
          });
        }

        // Refresh traces and FinOps counters from backend store
        const storeRes = await fetch('/api/telemetry');
        if (storeRes.ok) {
          const storeData = await storeRes.json();
          if (storeData.traces) setTraces(storeData.traces);
          if (storeData.finops) setFinops(storeData.finops);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Recovery pipeline failed';
        setApiError(message);
      } finally {
        setIsRecovering(false);
        isRecoveringRef.current = false;
      }
    },
    []
  );

  // Send a single telemetry frame to /api/telemetry for Tier-1 Nano triage
  const evaluateFrameWithNano = useCallback(
    async (frame: TelemetryFrame) => {
      try {
        const res = await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(frame),
        });

        if (!res.ok) throw new Error('Telemetry triage call failed');
        const data = await res.json();
        setApiError(null);
        setStatus(data.triage.status);
        if (data.finops) setFinops(data.finops);
        if (data.traces) setTraces(data.traces);
        if (data.lastExecutedCommand) setLastCommand(data.lastExecutedCommand);

        if (
          (data.triage.status === 'FAULT' || data.triage.status === 'WARNING') &&
          !isRecoveringRef.current
        ) {
          await triggerClosedLoopRecovery(frame, data.triage);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Telemetry connection error';
        setApiError(message);
      }
    },
    [triggerClosedLoopRecovery]
  );

  // High-frequency 30Hz Digital Twin Telemetry Loop (or Physical Bridge Poller)
  useEffect(() => {
    if (!isStreaming) return;

    if (twinState.mode === 'SYNTHETIC_TWIN') {
      const interval = setInterval(() => {
        const { nextState, frame } = stepDigitalTwin(twinRef.current, 0.033);
        twinRef.current = nextState;
        currentFrameRef.current = frame;
        setTwinState(nextState);
        setCurrentFrame(frame);

        setHistory((prev) => {
          const next = [...prev, frame];
          return next.length > 80 ? next.slice(next.length - 80) : next;
        });
      }, 33);

      return () => clearInterval(interval);
    } else {
      // In HARDWARE_LIVE mode, sync frames pushed by hardware/edge-bridge/bridge.ts
      const bridgePoll = setInterval(async () => {
        try {
          const res = await fetch('/api/telemetry');
          if (res.ok) {
            const data = await res.json();
            if (data.frames && data.frames.length > 0) {
              const latest = data.frames[data.frames.length - 1];
              currentFrameRef.current = latest;
              setCurrentFrame(latest);
              setHistory(data.frames.slice(-80));
            }
            if (data.traces) setTraces(data.traces);
            if (data.finops) setFinops(data.finops);
            if (data.lastExecutedCommand) setLastCommand(data.lastExecutedCommand);
          }
        } catch {
          // Ignore transient poll error
        }
      }, 400);

      return () => clearInterval(bridgePoll);
    }
  }, [isStreaming, twinState.mode]);

  // Periodic (1.2s) Tier-1 Nano Triage Dispatch (decoupled from 30Hz frame state updates)
  useEffect(() => {
    if (!isStreaming || twinState.mode !== 'SYNTHETIC_TWIN') return;

    const triageInterval = setInterval(() => {
      const frame = currentFrameRef.current;
      if (frame) {
        evaluateFrameWithNano(frame);
      }
    }, 1200);

    return () => clearInterval(triageInterval);
  }, [isStreaming, twinState.mode, evaluateFrameWithNano]);

  // Manual Fault Injection Handlers with Immediate Triage Dispatch
  const handleInjectFault = (fault: FaultMode) => {
    const faultedState = injectFault(twinRef.current, fault);
    const { nextState, frame } = stepDigitalTwin(faultedState, 0.033);
    twinRef.current = nextState;
    currentFrameRef.current = frame;
    setTwinState(nextState);
    setCurrentFrame(frame);
    setStatus(fault === 'NONE' ? 'NOMINAL' : 'FAULT');

    // Immediately trigger Tier-1 Nano triage & closed-loop recovery
    evaluateFrameWithNano(frame);
  };

  const handleResetFault = () => {
    const cleanState = resetFault(twinRef.current);
    const { nextState, frame } = stepDigitalTwin(cleanState, 0.033);
    twinRef.current = nextState;
    currentFrameRef.current = frame;
    setTwinState(nextState);
    setCurrentFrame(frame);
    setStatus('NOMINAL');
    setLastCommand(null);
    setApiError(null);
  };

  const handleManualPwmChange = (newPwm: number) => {
    setTwinState((prev) => {
      const next = { ...prev, targetPwm: newPwm };
      twinRef.current = next;
      return next;
    });
  };

  const handleEmergencyStop = () => {
    setTwinState((prev) => {
      const next = {
        ...prev,
        isEmergencyStopped: !prev.isEmergencyStopped,
        targetPwm: prev.isEmergencyStopped ? 200 : 0,
      };
      twinRef.current = next;
      return next;
    });
  };

  const handleSetMode = (mode: OperatingMode) => {
    setTwinState((prev) => {
      const next = { ...prev, mode };
      twinRef.current = next;
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-[#0B0F17] flex flex-col">
      {/* Top FinOps Metrics & Navigation Bar */}
      <FinOpsMetricsBar
        finops={finops}
        activeFault={twinState.activeFault}
        isStreaming={isStreaming}
        onToggleStream={() => setIsStreaming((prev) => !prev)}
      />

      {/* Main Command Center Telemetry Deck */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col gap-4">
        {apiError && (
          <div
            role="alert"
            className="bg-rose-500/10 border border-rose-500/40 text-rose-300 px-4 py-2.5 rounded-sm flex items-center justify-between text-xs font-mono"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>TELEMETRY PIPELINE ERROR: {apiError}</span>
            </span>
            <button
              onClick={() => setApiError(null)}
              className="px-2 py-1 rounded border border-rose-500/40 hover:bg-rose-500/20 focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* Oscilloscope Waveform & 16-Bin FFT Spectrum Monitor */}
        <WaveformMonitor
          currentFrame={currentFrame}
          history={history}
          status={status}
          isLoading={!currentFrame}
        />

        {/* Hardware Control Rig, Fault Injection, and Actuator Readouts */}
        <HardwareControlRig
          mode={twinState.mode}
          activeFault={twinState.activeFault}
          targetPwm={Math.round(twinState.targetPwm)}
          pidGains={{
            kp: twinState.pidKp,
            ki: twinState.pidKi,
            kd: twinState.pidKd,
          }}
          currentLimitMa={twinState.currentLimitMa}
          isEmergencyStopped={twinState.isEmergencyStopped}
          lastCommand={lastCommand}
          onSetMode={handleSetMode}
          onInjectFault={handleInjectFault}
          onResetFault={handleResetFault}
          onManualPwmChange={handleManualPwmChange}
          onEmergencyStop={handleEmergencyStop}
        />

        {/* Closed-Loop Agent Reasoning Trace and Tavily Grounding Panel */}
        <AgentTracePanel traces={traces} latestCitations={citations} />
      </div>
    </main>
  );
}
