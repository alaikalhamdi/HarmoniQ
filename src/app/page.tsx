'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

  const isRecoveringRef = useRef(isRecovering);
  isRecoveringRef.current = isRecovering;

  // Automated closed-loop anomaly recovery pipeline
  const triggerClosedLoopRecovery = useCallback(
    async (frame: TelemetryFrame, triageAssessment: { status: TriageStatus; faultSignature: string; targetComponent: string }) => {
      if (isRecoveringRef.current) return;
      setIsRecovering(true);

      try {
        // Step 2 & 3: Tavily Grounding & Nebius Ultra Policy Synthesis
        const diagRes = await fetch('/api/diagnose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frame,
            triage: triageAssessment,
          }),
        });

        if (!diagRes.ok) throw new Error('Diagnosis call failed');
        const diagData = await diagRes.json();

        if (diagData.citations) {
          setCitations(diagData.citations);
        }

        const candidateCommand: ActuationCommand = diagData.candidateCommand;

        // Step 4: Sandbox State-Space Verification
        const simRes = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frame,
            candidateCommand,
          }),
        });

        if (!simRes.ok) throw new Error('Simulation verification failed');
        const simData = await simRes.json();

        if (simData.verifiedCommand) {
          setLastCommand(simData.verifiedCommand);

          // Apply corrective actuation to the physical/digital twin
          setTwinState((prev) => applyActuationToTwin(prev, simData.verifiedCommand));
        }

        // Refresh traces from backend store
        const storeRes = await fetch('/api/telemetry');
        if (storeRes.ok) {
          const storeData = await storeRes.json();
          if (storeData.traces) setTraces(storeData.traces.reverse());
          if (storeData.finops) setFinops(storeData.finops);
        }
      } catch (err) {
        console.error('Closed-loop recovery pipeline error:', err);
      } finally {
        setIsRecovering(false);
      }
    },
    []
  );

  // High-frequency 30Hz Digital Twin Telemetry Generator Loop
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const { nextState, frame } = stepDigitalTwin(twinRef.current, 0.033);
      twinRef.current = nextState;
      setTwinState(nextState);
      setCurrentFrame(frame);

      setHistory((prev) => {
        const next = [...prev, frame];
        return next.length > 80 ? next.slice(next.length - 80) : next;
      });
    }, 33);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Periodic (1.2s) Tier-1 Nano Triage Dispatch
  useEffect(() => {
    if (!isStreaming) return;

    const triageInterval = setInterval(async () => {
      const frame = currentFrame;
      if (!frame) return;

      try {
        const res = await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(frame),
        });

        if (res.ok) {
          const data = await res.json();
          setStatus(data.triage.status);
          if (data.finops) setFinops(data.finops);

          // Escalate to Deep Recovery if WARNING or FAULT detected
          if (
            (data.triage.status === 'FAULT' || data.triage.status === 'WARNING') &&
            !isRecoveringRef.current
          ) {
            triggerClosedLoopRecovery(frame, data.triage);
          }
        }
      } catch (err) {
        console.error('Telemetry post error:', err);
      }
    }, 1200);

    return () => clearInterval(triageInterval);
  }, [isStreaming, currentFrame, triggerClosedLoopRecovery]);

  // Manual Fault Injection Handlers
  const handleInjectFault = (fault: FaultMode) => {
    setTwinState((prev) => injectFault(prev, fault));
    setStatus(fault === 'NONE' ? 'NOMINAL' : 'FAULT');
  };

  const handleResetFault = () => {
    setTwinState((prev) => resetFault(prev));
    setStatus('NOMINAL');
    setLastCommand(null);
  };

  const handleManualPwmChange = (newPwm: number) => {
    setTwinState((prev) => ({ ...prev, targetPwm: newPwm }));
  };

  const handleEmergencyStop = () => {
    setTwinState((prev) => ({
      ...prev,
      isEmergencyStopped: !prev.isEmergencyStopped,
      targetPwm: prev.isEmergencyStopped ? 200 : 0,
    }));
  };

  const handleSetMode = (mode: OperatingMode) => {
    setTwinState((prev) => ({ ...prev, mode }));
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
