import {
  ActuationCommand,
  FaultMode,
  OperatingMode,
  TelemetryFrame,
  TelemetryMetrics,
} from './types';

export interface DigitalTwinInternalState {
  timeSeconds: number;
  mode: OperatingMode;
  activeFault: FaultMode;
  targetPwm: number;
  actualPwm: number;
  voltageV: number;
  currentMa: number;
  temperatureC: number;
  vibrationG: number;
  dominantFreqHz: number;
  pidKp: number;
  pidKi: number;
  pidKd: number;
  currentLimitMa: number;
  isEmergencyStopped: boolean;
  recoveryTargetReached: boolean;
}

export function createInitialTwinState(): DigitalTwinInternalState {
  return {
    timeSeconds: 0,
    mode: 'SYNTHETIC_TWIN',
    activeFault: 'NONE',
    targetPwm: 200,
    actualPwm: 200,
    voltageV: 12.1,
    currentMa: 420,
    temperatureC: 41.0,
    vibrationG: 0.22,
    dominantFreqHz: 120,
    pidKp: 1.2,
    pidKi: 0.05,
    pidKd: 0.15,
    currentLimitMa: 2000,
    isEmergencyStopped: false,
    recoveryTargetReached: false,
  };
}

export function injectFault(
  state: DigitalTwinInternalState,
  fault: FaultMode
): DigitalTwinInternalState {
  return {
    ...state,
    activeFault: fault,
    isEmergencyStopped: false,
    recoveryTargetReached: false,
  };
}

export function resetFault(
  state: DigitalTwinInternalState
): DigitalTwinInternalState {
  return {
    ...state,
    activeFault: 'NONE',
    targetPwm: 200,
    currentLimitMa: 2000,
    isEmergencyStopped: false,
    recoveryTargetReached: false,
  };
}

export function applyActuationToTwin(
  state: DigitalTwinInternalState,
  command: ActuationCommand
): DigitalTwinInternalState {
  const next = { ...state };

  switch (command.action) {
    case 'SET_PWM':
      if (typeof command.parameters.targetPwm === 'number') {
        next.targetPwm = Math.max(0, Math.min(255, command.parameters.targetPwm));
        next.recoveryTargetReached = true;
      }
      break;

    case 'ENGAGE_CURRENT_LIMIT':
      if (typeof command.parameters.currentLimitMa === 'number') {
        next.currentLimitMa = command.parameters.currentLimitMa;
      } else {
        next.currentLimitMa = 600;
      }
      next.recoveryTargetReached = true;
      break;

    case 'RECALIBRATE_PID':
      if (typeof command.parameters.kp === 'number') next.pidKp = command.parameters.kp;
      if (typeof command.parameters.ki === 'number') next.pidKi = command.parameters.ki;
      if (typeof command.parameters.kd === 'number') next.pidKd = command.parameters.kd;
      next.recoveryTargetReached = true;
      break;

    case 'EMERGENCY_CUTOFF':
      next.isEmergencyStopped = true;
      next.targetPwm = 0;
      next.recoveryTargetReached = true;
      break;
  }

  return next;
}

export function stepDigitalTwin(
  state: DigitalTwinInternalState,
  dtSeconds = 0.033
): { nextState: DigitalTwinInternalState; frame: TelemetryFrame } {
  const next = { ...state };
  next.timeSeconds += dtSeconds;

  // Smoothing factor for first-order thermal and motor inertia lag
  const alphaPwm = 0.15;
  const alphaThermal = 0.03;
  const alphaElectrical = 0.25;

  // Actual PWM tracks target PWM with physical rotor/motor inertia
  if (next.isEmergencyStopped) {
    next.targetPwm = 0;
  }
  next.actualPwm += (next.targetPwm - next.actualPwm) * alphaPwm;

  // Realistic Gaussian noise generator
  const noise = (scale = 1.0) => (Math.random() - 0.5) * 2 * scale;

  let targetVoltage = 12.1;
  let targetCurrent = 80 + (next.actualPwm / 255) * 380;
  let targetTemp = 32 + (next.actualPwm / 255) * 15;
  let targetVibration = 0.05 + (next.actualPwm / 255) * 0.2;
  let targetFreq = (next.actualPwm / 255) * 135;

  if (next.activeFault === 'BEARING_WEAR') {
    // Bearing race damage creates secondary harmonic resonance at ~385Hz
    targetVibration = 0.88 + noise(0.08);
    targetFreq = 385;
    targetCurrent += 70 + noise(15);
    targetTemp += 12;
  } else if (next.activeFault === 'VOLTAGE_BROWNOUT') {
    // Supply rail sag and load dump transient
    targetVoltage = 8.35;
    targetCurrent = 1450 + noise(60);
    targetTemp += 22;
    targetVibration += 0.15;
  } else if (next.activeFault === 'THERMAL_RUNAWAY') {
    // MOSFET thermal runaway due to high duty cycle and gate drift
    targetTemp = 112.0;
    targetCurrent += 350;
    targetVoltage = 11.4;
  }

  // If recovery was applied, damp the active fault symptoms
  if (next.recoveryTargetReached) {
    if (next.activeFault === 'BEARING_WEAR') {
      const derateRatio = next.actualPwm / 200;
      targetVibration = 0.24 * derateRatio + 0.05;
      targetFreq = Math.max(60, 130 * derateRatio);
    } else if (next.activeFault === 'VOLTAGE_BROWNOUT') {
      targetVoltage = 11.95;
      targetCurrent = Math.min(next.currentLimitMa, 420);
    } else if (next.activeFault === 'THERMAL_RUNAWAY') {
      const coolRatio = next.actualPwm / 200;
      targetTemp = 42 + 25 * coolRatio;
    }
  }

  // Update physical metrics with first-order dynamics
  next.voltageV += (targetVoltage - next.voltageV) * alphaElectrical + noise(0.02);
  next.currentMa += (targetCurrent - next.currentMa) * alphaElectrical + noise(3.0);
  next.temperatureC += (targetTemp - next.temperatureC) * alphaThermal + noise(0.05);
  next.vibrationG += (targetVibration - next.vibrationG) * 0.2 + noise(0.015);
  next.dominantFreqHz = targetFreq + noise(1.5);

  // Apply current limit clamp
  if (next.currentMa > next.currentLimitMa) {
    next.currentMa = next.currentLimitMa + noise(2.0);
  }

  // Construct 16-bin normalized FFT frequency spectrum (0Hz - 512Hz, ~32Hz/bin)
  const fftBins: number[] = new Array(16).fill(0);
  const dominantBin = Math.max(0, Math.min(15, Math.floor(next.dominantFreqHz / 32)));

  for (let i = 0; i < 16; i++) {
    const dist = Math.abs(i - dominantBin);
    let binVal = 0.04 * Math.exp(-dist * 1.5) + Math.random() * 0.03;

    if (i === dominantBin) {
      binVal = Math.min(1.0, next.vibrationG);
    }

    if (next.activeFault === 'BEARING_WEAR' && (i === 11 || i === 12)) {
      binVal = Math.max(binVal, 0.75 + Math.random() * 0.2);
    }

    fftBins[i] = parseFloat(binVal.toFixed(3));
  }

  const metrics: TelemetryMetrics = {
    supplyVoltageV: parseFloat(next.voltageV.toFixed(2)),
    currentDrawMa: Math.max(0, parseFloat(next.currentMa.toFixed(1))),
    temperatureC: parseFloat(next.temperatureC.toFixed(1)),
    pwmDutyCycle: Math.round(next.actualPwm),
    fftDominantFreqHz: Math.round(next.dominantFreqHz),
    fftPeakMagnitude: parseFloat(Math.max(0, next.vibrationG).toFixed(3)),
    fftBins,
  };

  const frame: TelemetryFrame = {
    timestamp: Date.now(),
    deviceId: 'ESP32S3-RIG-01',
    mode: next.mode,
    metrics,
  };

  return { nextState: next, frame };
}
