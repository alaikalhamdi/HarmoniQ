import { NextRequest, NextResponse } from 'next/server';
import { runTier1Triage } from '@/lib/nebius';
import { telemetryStore } from '@/lib/store';
import { AgentTraceEvent, TelemetryFrame } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const frame: TelemetryFrame = await req.json();

    if (!frame || !frame.metrics) {
      return NextResponse.json(
        { error: 'Invalid telemetry payload: metrics object is required' },
        { status: 400 }
      );
    }

    telemetryStore.addTelemetryFrame(frame);

    // Execute Tier-1 Nano triage evaluation (<150ms)
    const triage = await runTier1Triage(frame);

    const trace: AgentTraceEvent = {
      id: `TRC-T1-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      stage: 'TRIAGE_NANO',
      status: triage.status === 'NOMINAL' ? 'SUCCESS' : 'WARNING',
      latencyMs: triage.triageLatencyMs,
      description: `Tier-1 Nano classified frame as ${triage.status} (${triage.faultSignature.slice(0, 95)})`,
      details: {
        status: triage.status,
        confidence: triage.confidence,
        targetComponent: triage.targetComponent,
        modelUsed: triage.modelUsed,
      },
    };
    telemetryStore.addAgentTrace(trace);

    return NextResponse.json({
      triage,
      finops: telemetryStore.getFinOpsStats(),
      traces: telemetryStore.getRecentTraces(20).reverse(),
      lastExecutedCommand: telemetryStore.getLastExecutedCommand(),
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    return NextResponse.json({
      frames: telemetryStore.getRecentTelemetry(60),
      traces: telemetryStore.getRecentTraces(20).reverse(),
      finops: telemetryStore.getFinOpsStats(),
      pendingCommand: telemetryStore.popPendingCommand(),
      lastExecutedCommand: telemetryStore.getLastExecutedCommand(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
