import { NextRequest, NextResponse } from 'next/server';
import { runTier2Diagnosis } from '@/lib/nebius';
import { telemetryStore } from '@/lib/store';
import { searchHardwareDatasheets } from '@/lib/tavily';
import { AgentTraceEvent, TelemetryFrame, TriageAssessment } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const frame: TelemetryFrame = body.frame;
    const triage: TriageAssessment = body.triage;

    if (!frame || !triage) {
      return NextResponse.json(
        { error: 'Both frame and triage assessment objects are required' },
        { status: 400 }
      );
    }

    // Step 2: Ground diagnosis in live hardware datasheets via Tavily Search API
    const tavilyStart = performance.now();
    const citations = await searchHardwareDatasheets(
      triage.faultSignature,
      triage.targetComponent
    );
    const tavilyLatencyMs = Math.round(performance.now() - tavilyStart);

    // Record Tavily grounding trace
    const tavilyTrace: AgentTraceEvent = {
      id: `TRC-TAVILY-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      stage: 'DATASHEET_TAVILY',
      status: 'SUCCESS',
      latencyMs: tavilyLatencyMs,
      description: `Retrieved ${citations.length} manufacturer datasheet specifications for ${triage.targetComponent}`,
      details: {
        targetComponent: triage.targetComponent,
        citationsCount: citations.length,
        primarySource: citations[0]?.title || 'Datasheet Base',
        primaryUrl: citations[0]?.url || '',
      },
    };
    telemetryStore.addAgentTrace(tavilyTrace);

    // Step 3: Deep Root-Cause & Policy Synthesis via Nebius Nemotron Ultra
    const diagnosis = await runTier2Diagnosis(frame, triage, citations);

    // Record Ultra policy synthesis trace
    const ultraTrace: AgentTraceEvent = {
      id: `TRC-ULTRA-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      stage: 'POLICY_ULTRA',
      status: 'SUCCESS',
      latencyMs: diagnosis.diagnosisLatencyMs,
      description: `Synthesized recovery policy: ${diagnosis.recommendedCommand.action} (${diagnosis.rootCause.slice(0, 80)})`,
      details: {
        rootCause: diagnosis.rootCause,
        severity: diagnosis.severity,
        action: diagnosis.recommendedCommand.action,
        parameters: diagnosis.recommendedCommand.parameters,
        modelUsed: diagnosis.modelUsed,
      },
    };
    telemetryStore.addAgentTrace(ultraTrace);

    return NextResponse.json({
      citations,
      diagnosis,
      candidateCommand: diagnosis.recommendedCommand,
      latencies: {
        tavilyMs: tavilyLatencyMs,
        nebiusUltraMs: diagnosis.diagnosisLatencyMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
