import {
  createInitialTwinState,
  injectFault,
  stepDigitalTwin,
  applyActuationToTwin,
} from '../src/lib/digital-twin';
import { runTier1Triage, runTier2Diagnosis } from '../src/lib/nebius';
import { searchHardwareDatasheets } from '../src/lib/tavily';
import { verifyPolicyInSandbox } from '../src/lib/simulator';
import { FaultMode } from '../src/lib/types';

async function testFaultLifecycle(faultMode: FaultMode) {
  console.log(`\n=== TESTING CLOSED-LOOP LIFECYCLE: ${faultMode} ===`);
  let twin = createInitialTwinState();
  twin = injectFault(twin, faultMode);

  // Step 15 frames into the fault onset
  for (let i = 0; i < 15; i++) {
    twin = stepDigitalTwin(twin).nextState;
  }
  const faultStep = stepDigitalTwin(twin);
  twin = faultStep.nextState;

  // Stage 1: Tier-1 Nano Triage
  const triage = await runTier1Triage(faultStep.frame);
  console.log(
    `[Stage 1: Nano Triage] Status: ${triage.status} | Component: ${triage.targetComponent} | Signature: ${triage.faultSignature}`
  );
  if (triage.status === 'NOMINAL') {
    throw new Error(`Expected non-nominal status for ${faultMode}`);
  }

  // Stage 2: Tavily Datasheet Grounding
  const citations = await searchHardwareDatasheets(
    triage.faultSignature,
    triage.targetComponent
  );
  console.log(
    `[Stage 2: Tavily Grounding] Retrieved ${citations.length} citation(s) | Primary: ${citations[0]?.title}`
  );

  // Stage 3: Tier-2 Ultra Root-Cause & Policy Synthesis
  const diagnosis = await runTier2Diagnosis(faultStep.frame, triage, citations);
  console.log(
    `[Stage 3: Ultra Synthesis] Severity: ${diagnosis.severity} | Action: ${diagnosis.recommendedCommand.action} | Reason: ${diagnosis.recommendedCommand.parameters.reason}`
  );

  // Stage 4: State-Space Sandbox Verification
  const sim = await verifyPolicyInSandbox(
    faultStep.frame,
    diagnosis.recommendedCommand
  );
  console.log(
    `[Stage 4: Sandbox Verify] Verified: ${sim.verified} | Pred Temp: ${sim.predictedTempC}C | Pred Vib: ${sim.predictedVibrationG}g | Margin: ${sim.safetyMarginPercent}%`
  );
  if (!sim.verified) {
    throw new Error(`Expected candidate command for ${faultMode} to pass verification`);
  }

  // Stage 5: Apply Actuation & Verify Convergence Back to NOMINAL
  twin = applyActuationToTwin(twin, diagnosis.recommendedCommand);
  for (let i = 0; i < 75; i++) {
    twin = stepDigitalTwin(twin).nextState;
  }
  const recoveredStep = stepDigitalTwin(twin);
  const postTriage = await runTier1Triage(recoveredStep.frame);
  console.log(
    `[Stage 5: Rig Stabilized] Post-Recovery Status: ${postTriage.status} | ActiveFault Latch: ${recoveredStep.nextState.activeFault} | V: ${recoveredStep.frame.metrics.supplyVoltageV}V | T: ${recoveredStep.frame.metrics.temperatureC}C | Vib: ${recoveredStep.frame.metrics.fftPeakMagnitude}g @ ${recoveredStep.frame.metrics.fftDominantFreqHz}Hz`
  );
  if (postTriage.status !== 'NOMINAL') {
    throw new Error(`Expected rig to stabilize back to NOMINAL after ${faultMode}, got ${postTriage.status}`);
  }
}

async function runAllTests() {
  console.log('--- TEST 0: NOMINAL BASELINE ---');
  const twin = createInitialTwinState();
  const nominalStep = stepDigitalTwin(twin);
  const nominalTriage = await runTier1Triage(nominalStep.frame);
  console.log('Nominal Triage:', nominalTriage.status, '|', nominalTriage.faultSignature);
  if (nominalTriage.status !== 'NOMINAL') {
    throw new Error('Expected NOMINAL status at baseline');
  }

  await testFaultLifecycle('THERMAL_RUNAWAY');
  await testFaultLifecycle('VOLTAGE_BROWNOUT');
  await testFaultLifecycle('BEARING_WEAR');

  console.log('\nALL 4 CLOSED-LOOP SCENARIOS PASSED 100%!');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
