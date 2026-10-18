import { ActuationCommand, SafetyLimitOverrides, SimulationResult, TelemetryFrame } from './types';

export async function verifyPolicyInSandbox(
  frame: TelemetryFrame,
  command: ActuationCommand,
  overrides?: SafetyLimitOverrides
): Promise<SimulationResult> {
  const startTime = performance.now();

  // Initial conditions extracted from edge telemetry frame
  let simTemp = frame.metrics.temperatureC;
  let simCurrent = frame.metrics.currentDrawMa;
  let simVibration = frame.metrics.fftPeakMagnitude;
  let simPwm = frame.metrics.pwmDutyCycle;

  const targetPwm =
    command.action === 'EMERGENCY_CUTOFF'
      ? 0
      : typeof command.parameters.targetPwm === 'number'
      ? command.parameters.targetPwm
      : simPwm * 0.6;

  const currentLimit =
    typeof command.parameters.currentLimitMa === 'number'
      ? command.parameters.currentLimitMa
      : command.action === 'ENGAGE_CURRENT_LIMIT'
      ? 650
      : 2000;

  // Damping factor calculated from PID gains
  const dampingFactor =
    command.action === 'RECALIBRATE_PID'
      ? Math.min(2.0, (command.parameters.kd || 0.15) * 6.0)
      : 1.0;

  // 50-step forward discrete-time state-space simulation (dt = 0.05s => 2.5s horizon)
  const steps = 50;
  for (let i = 0; i < steps; i++) {
    // PWM actuator tracking
    simPwm += (targetPwm - simPwm) * 0.15;

    // Steady state target estimates under new control parameters with Joule heating
    const ambientTemp = 30.0;
    const jouleHeat = Math.pow(simPwm / 255, 1.8) * 65.0 + (simCurrent / 1000.0) * 15.0;
    const targetTempSteady = ambientTemp + jouleHeat;
    const targetCurrentSteady = 75.0 + (simPwm / 255) * 650.0;
    const targetVibrationSteady = (0.05 + (simPwm / 255) * 0.22) / dampingFactor;

    // First order discrete transitions
    simTemp += (targetTempSteady - simTemp) * 0.04;
    simCurrent += (targetCurrentSteady - simCurrent) * 0.2;
    simVibration += (targetVibrationSteady - simVibration) * 0.18;

    // Apply electrical current limit clamp
    if (simCurrent > currentLimit) {
      simCurrent = currentLimit;
    }
  }

  // Safety boundary constraints (grounded in datasheet limits or defaults)
  const limits = overrides || command.extractedLimits;
  // Extracted limits are untrusted: they may only tighten the built-in bounds, never loosen them.
  const maxSafeTemp = Math.min(85.0, limits?.maxSafeTempC ?? 85.0);
  const maxSafeCurrent = Math.min(1200.0, limits?.maxSafeCurrentMa ?? 1200.0);
  const maxSafeVibration = Math.min(0.40, limits?.maxSafeVibrationG ?? 0.40);

  const isTempSafe = simTemp <= maxSafeTemp;
  const isCurrentSafe = simCurrent <= maxSafeCurrent;
  const isVibrationSafe = simVibration <= maxSafeVibration;

  const verified = isTempSafe && isCurrentSafe && isVibrationSafe;

  // Compute safety margin percent relative to worst-case threshold
  const tempMargin = Math.max(0, (maxSafeTemp - simTemp) / maxSafeTemp);
  const currentMargin = Math.max(0, (maxSafeCurrent - simCurrent) / maxSafeCurrent);
  const vibMargin = Math.max(0, (maxSafeVibration - simVibration) / maxSafeVibration);
  const safetyMarginPercent = Math.round(
    Math.min(tempMargin, currentMargin, vibMargin) * 100
  );

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    verified,
    predictedTempC: parseFloat(simTemp.toFixed(1)),
    predictedVibrationG: parseFloat(simVibration.toFixed(3)),
    predictedCurrentMa: parseFloat(simCurrent.toFixed(1)),
    safetyMarginPercent,
    verifierBackend: 'LOCAL_STATE_SPACE',
    executionTimeMs,
  };
}
