import { NextRequest, NextResponse } from 'next/server';
import { verifyPolicyWithDispatch } from '@/lib/verifier-job';
import { telemetryStore } from '@/lib/store';
import { ActuationCommand, AgentTraceEvent, TelemetryFrame } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const frame: TelemetryFrame = body.frame;
    const candidateCommand: ActuationCommand = body.candidateCommand;

    if (!frame || !candidateCommand) {
      return NextResponse.json(
        { error: 'Both telemetry frame and candidate command objects are required' },
        { status: 400 }
      );
    }

    // Step 4: Validate proposed control parameters in sandbox simulation
    const { result: simulation, backend, jobId, jobState } = await verifyPolicyWithDispatch(
      frame,
      candidateCommand
    );

    // Record simulation verification trace
    const simTrace: AgentTraceEvent = {
      id: `TRC-SIM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      stage: 'SIMULATION_VERIFY',
      status: simulation.verified ? 'SUCCESS' : 'FAILED',
      latencyMs: simulation.executionTimeMs,
      description: `State-space verifier: ${
        simulation.verified ? 'PASS' : 'FAIL'
      } via ${backend} (Pred Temp: ${simulation.predictedTempC}C, Vib: ${
        simulation.predictedVibrationG
      }g, Current: ${simulation.predictedCurrentMa}mA, Margin: ${
        simulation.safetyMarginPercent
      }%)`,
      details: {
        verified: simulation.verified,
        predictedTempC: simulation.predictedTempC,
        predictedVibrationG: simulation.predictedVibrationG,
        predictedCurrentMa: simulation.predictedCurrentMa,
        safetyMarginPercent: simulation.safetyMarginPercent,
        backend,
        jobId,
        jobState,
      },
    };
    telemetryStore.addAgentTrace(simTrace);

    // If verified safe, mark command as verified and queue for hardware dispatch
    if (simulation.verified) {
      candidateCommand.verifiedBySimulation = true;
      telemetryStore.queueActuationCommand(candidateCommand);

      // Record dispatch trace
      const dispatchTrace: AgentTraceEvent = {
        id: `TRC-DISP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: Date.now(),
        stage: 'ACTUATION_DISPATCH',
        status: 'SUCCESS',
        latencyMs: 5,
        description: `Dispatched verified ${candidateCommand.action} command to ${candidateCommand.targetDeviceId}`,
        details: {
          commandId: candidateCommand.commandId,
          action: candidateCommand.action,
          parameters: candidateCommand.parameters,
          modelChain: candidateCommand.modelChainUsed,
        },
      };
      telemetryStore.addAgentTrace(dispatchTrace);
    }

    return NextResponse.json({
      simulation,
      verifiedCommand: candidateCommand,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
