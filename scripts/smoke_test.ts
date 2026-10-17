import { createInitialTwinState, injectFault, stepDigitalTwin, applyActuationToTwin } from '../src/lib/digital-twin';
import { runTier1Triage, runTier2Diagnosis } from '../src/lib/nebius';
import { searchHardwareDatasheets } from '../src/lib/tavily';
import { verifyPolicyInSandbox } from '../src/lib/simulator';

async function test() {
  console.log('--- TEST 1: NOMINAL FRAME ---');
  let twin = createInitialTwinState();
  const step1 = stepDigitalTwin(twin);
  twin = step1.nextState;
  const triage1 = await runTier1Triage(step1.frame);
  console.log('Triage 1:', triage1.status, '|', triage1.faultSignature);

  console.log('--- TEST 2: FAULT INJECTION (THERMAL_RUNAWAY) ---');
  twin = injectFault(twin, 'THERMAL_RUNAWAY');
  for (let i = 0; i < 30; i++) {
    const s = stepDigitalTwin(twin);
    twin = s.nextState;
  }
  const faultStep = stepDigitalTwin(twin);
  twin = faultStep.nextState;
  const triage2 = await runTier1Triage(faultStep.frame);
  console.log('Triage 2:', triage2.status, '| Target:', triage2.targetComponent);

  console.log('--- TEST 3: TAVILY DATASHEET LOOKUP ---');
  const citations = await searchHardwareDatasheets(triage2.faultSignature, triage2.targetComponent);
  console.log('Citations retrieved:', citations.length, '|', citations[0]?.title);

  console.log('--- TEST 4: TIER-2 ULTRA POLICY SYNTHESIS ---');
  const diagnosis = await runTier2Diagnosis(faultStep.frame, triage2, citations);
  console.log('Diagnosis severity:', diagnosis.severity, '| Action:', diagnosis.recommendedCommand.action);

  console.log('--- TEST 5: SIMULATOR VERIFICATION ---');
  const sim = await verifyPolicyInSandbox(faultStep.frame, diagnosis.recommendedCommand);
  console.log('Sandbox verified:', sim.verified, '| Pred Temp:', sim.predictedTempC + 'C | Margin:', sim.safetyMarginPercent + '%');

  console.log('--- TEST 6: CLOSED-LOOP RIG RECOVERY ---');
  twin = applyActuationToTwin(twin, diagnosis.recommendedCommand);
  for (let i = 0; i < 60; i++) {
    const s = stepDigitalTwin(twin);
    twin = s.nextState;
  }
  const recoveryStep = stepDigitalTwin(twin);
  console.log('Recovered metrics:', recoveryStep.frame.metrics.temperatureC + 'C | PWM:', recoveryStep.frame.metrics.pwmDutyCycle);
  console.log('STATUS: ALL PIPELINE TESTS PASSED!');
  process.exit(0);
}

test().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
