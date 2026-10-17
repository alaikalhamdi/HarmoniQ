import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ActuationCommand,
  AgentTraceEvent,
  FinOpsStats,
  TelemetryFrame,
} from './types';

// In-memory ring buffer storage limits
const MAX_TELEMETRY_FRAMES = 120;
const MAX_TRACE_EVENTS = 50;

class TelemetryStore {
  private frames: TelemetryFrame[] = [];
  private traces: AgentTraceEvent[] = [];
  private pendingCommand: ActuationCommand | null = null;
  private lastExecutedCommand: ActuationCommand | null = null;
  private supabase: SupabaseClient | null = null;

  private triageLatencyTotalMs = 0;
  private triageLatencySamples = 0;

  private finops: FinOpsStats = {
    tier1Calls: 0,
    tier2Calls: 0,
    totalFramesProcessed: 0,
    filteredNominalPercent: 100,
    estimatedCostSavingsUsd: 0,
    averageTriageLatencyMs: 42,
    activeTier1Model: 'nvidia/Nemotron-3-Nano-30B',
    activeTier2Model: 'nvidia/Nemotron-3-Ultra-550b-a55b',
    inferenceSource: 'FALLBACK_SIM',
  };

  constructor() {
    this.initSupabaseClient();
  }

  private initSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (url && anonKey && !url.includes('your-project')) {
      try {
        this.supabase = createClient(url, anonKey);
      } catch {
        this.supabase = null;
      }
    }
  }

  public addTelemetryFrame(frame: TelemetryFrame) {
    this.frames.push(frame);
    if (this.frames.length > MAX_TELEMETRY_FRAMES) {
      this.frames.shift();
    }
    this.finops.totalFramesProcessed += 1;
  }

  public getRecentTelemetry(limit = 60): TelemetryFrame[] {
    return this.frames.slice(-limit);
  }

  public getLatestFrame(): TelemetryFrame | null {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
  }

  public addAgentTrace(trace: AgentTraceEvent) {
    this.traces.push(trace);
    if (this.traces.length > MAX_TRACE_EVENTS) {
      this.traces.shift();
    }

    // Optional fire-and-forget logging to Supabase if configured
    if (this.supabase) {
      Promise.resolve(
        this.supabase.from('agent_traces').insert({
          trace_id: trace.id,
          stage: trace.stage,
          status: trace.status,
          latency_ms: trace.latencyMs,
          description: trace.description,
          details: trace.details,
          created_at: new Date(trace.timestamp).toISOString(),
        })
      ).catch(() => {});
    }
  }

  public getRecentTraces(limit = 20): AgentTraceEvent[] {
    return this.traces.slice(-limit);
  }

  public queueActuationCommand(command: ActuationCommand) {
    this.pendingCommand = command;
    this.lastExecutedCommand = command;

    if (this.supabase) {
      Promise.resolve(
        this.supabase.from('actuation_history').insert({
          command_id: command.commandId,
          device_id: command.targetDeviceId,
          action: command.action,
          parameters: command.parameters,
          verified_by_simulation: command.verifiedBySimulation,
          model_chain: command.modelChainUsed,
          created_at: new Date(command.timestamp).toISOString(),
        })
      ).catch(() => {});
    }
  }

  public popPendingCommand(): ActuationCommand | null {
    const cmd = this.pendingCommand;
    this.pendingCommand = null;
    return cmd;
  }

  public getLastExecutedCommand(): ActuationCommand | null {
    return this.lastExecutedCommand;
  }

  public updateFinOps(update: Partial<FinOpsStats>) {
    this.finops = { ...this.finops, ...update };

    // Recompute percentage of nominal frames filtered by Tier 1
    if (this.finops.tier1Calls > 0) {
      const escalated = this.finops.tier2Calls;
      const filtered = Math.max(0, this.finops.tier1Calls - escalated);
      this.finops.filteredNominalPercent = parseFloat(
        ((filtered / this.finops.tier1Calls) * 100).toFixed(1)
      );

      // Estimated savings: assuming Ultra token pass costs ~$0.006 and Nano costs ~$0.0001
      const savedCalls = filtered;
      this.finops.estimatedCostSavingsUsd = parseFloat((savedCalls * 0.0059).toFixed(4));
    }
  }

  public getFinOpsStats(): FinOpsStats {
    return { ...this.finops };
  }

  // Maintains a true running mean of Tier-1 triage latency rather than echoing the
  // most recent sample.
  public recordTriageLatency(latencyMs: number) {
    this.triageLatencyTotalMs += latencyMs;
    this.triageLatencySamples += 1;
    this.finops.averageTriageLatencyMs = Math.round(
      this.triageLatencyTotalMs / this.triageLatencySamples
    );
  }

  public reset() {
    this.frames = [];
    this.traces = [];
    this.pendingCommand = null;
    this.lastExecutedCommand = null;
    this.triageLatencyTotalMs = 0;
    this.triageLatencySamples = 0;
  }
}

// Global singleton instance for server runtime
declare global {
  // eslint-disable-next-line no-var
  var __telemetryStore: TelemetryStore | undefined;
}

export const telemetryStore = globalThis.__telemetryStore || new TelemetryStore();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__telemetryStore = telemetryStore;
}
