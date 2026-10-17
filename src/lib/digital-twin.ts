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
  const next: DigitalTwinInternalState = {
    ...state,
    activeFault: fault,
    isEmergencyStopped: false,
    recoveryTargetReached: false,
  };

  // Seed initial fault onset so immediate telemetry frame reflects the physical transient
  if (fault === 'THERMAL_RUNAWAY') {
    next.temperatureC = Math.max(next.temperatureC, 98.5);
    next.currentMa = Math.max(next.currentMa, 860);
  } else if (fault === 'VOLTAGE_BROWNOUT') {
    next.voltageV = 8.4;
    next.currentMa = 1420;
  } else if (fault === 'BEARING_WEAR') {
    next.vibrationG = 0.86;
    next.dominantFreqHz = 385;
  }

  return next;
}

export function resetFault(
  state: DigitalTwinInternalState
): DigitalTwinInternalState {
  return {
    ...state,
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

export function applyActuationToTwin(
  state: DigitalTwinInternalState,
  command: ActuationCommand
): DigitalTwinInternalState {
  const next = { ...state };

  if (typeof command.parameters.targetPwm === 'number') {
    next.targetPwm = Math.max(0, Math.min(255, command.parameters.targetPwm));
  }

  switch (command.action) {
    case 'SET_PWM':
      next.recoveryTargetReached = true;
      break;

    case 'ENGAGE_CURRENT_LIMIT':
      next.currentLimitMa =
        typeof command.parameters.currentLimitMa === 'number'
          ? command.parameters.currentLimitMa
          : 650;
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

  const alphaPwm = 0.18;
  const alphaThermal = 0.08;
  const alphaElectrical = 0.25;

  if (next.isEmergencyStopped) {
    next.targetPwm = 0;
  }
  next.actualPwm += (next.targetPwm - next.actualPwm) * alphaPwm;

  const noise = (scale = 1.0) => (Math.random() - 0.5) * 2 * scale;

  let targetVoltage = 12.1;
  let targetCurrent = 80 + (next.actualPwm / 255) * 380;
  let targetTemp = 32 + (next.actualPwm / 255) * 15;
  let targetVibration = 0.05 + (next.actualPwm / 255) * 0.2;
  let targetFreq = (next.actualPwm / 255) * 135;

  if (next.activeFault === 'BEARING_WEAR') {
    targetVibration = 0.88 + noise(0.06);
    targetFreq = 385;
    targetCurrent += 70 + noise(12);
    targetTemp += 10;
  } else if (next.activeFault === 'VOLTAGE_BROWNOUT') {
    targetVoltage = 8.35;
    targetCurrent = 1450 + noise(45);
    targetTemp += 18;
    targetVibration += 0.12;
  } else if (next.activeFault === 'THERMAL_RUNAWAY') {
    targetTemp = 112.0;
    targetCurrent += 350;
    targetVoltage = 11.4;
  }

  // When closed-loop actuation has been applied, damp the fault back toward safe SOA limits
  if (next.recoveryTargetReached) {
    if (next.activeFault === 'BEARING_WEAR') {
      const derateRatio = next.actualPwm / 200;
      const kdDamping = Math.max(1.0, next.pidKd / 0.15);
      targetVibration = (0.22 * derateRatio) / kdDamping + 0.05;
      targetFreq = Math.max(70, 120 * derateRatio);
    } else if (next.activeFault === 'VOLTAGE_BROWNOUT') {
      targetVoltage = 11.95;
      targetCurrent = Math.min(next.currentLimitMa, 410);
      targetTemp = 43.0;
    } else if (next.activeFault === 'THERMAL_RUNAWAY') {
      const coolRatio = next.actualPwm / 200;
      targetTemp = 40 + 18 * coolRatio;
      targetCurrent = 80 + (next.actualPwm / 255) * 340;
      targetVoltage = 12.05;
    }
  }

  next.voltageV += (targetVoltage - next.voltageV) * alphaElectrical + noise(0.02);
  next.currentMa += (targetCurrent - next.currentMa) * alphaElectrical + noise(2.5);
  next.temperatureC += (targetTemp - next.temperatureC) * alphaThermal + noise(0.05);
  next.vibrationG += (targetVibration - next.vibrationG) * 0.22 + noise(0.012);
  next.dominantFreqHz += (targetFreq - next.dominantFreqHz) * 0.25 + noise(1.0);

  if (next.currentMa > next.currentLimitMa) {
    next.currentMa = next.currentLimitMa + noise(2.0);
  }

  // Once physical metrics converge back inside nominal Safe Operating Area after actuation, clear active fault latch
  if (
    next.recoveryTargetReached &&
    next.activeFault !== 'NONE' &&
    next.temperatureC < 62.0 &&
    next.voltageV > 11.3 &&
    next.vibrationG < 0.30 &&
    next.dominantFreqHz < 220
  ) {
    next.activeFault = 'NONE';
    next.recoveryTargetReached = false;
  }

  // Construct 16-bin normalized FFT frequency spectrum (0Hz - 512Hz, ~32Hz/bin)
  const fftBins: number[] = new Array(16).fill(0);
  const dominantBin = Math.max(0, Math.min(15, Math.floor(next.dominantFreqHz / 32)));

  for (let i = 0; i < 16; i++) {
    const dist = Math.abs(i - dominantBin);
    let binVal = 0.04 * Math.exp(-dist * 1.5) + Math.random() * 0.025;

    if (i === dominantBin) {
      binVal = Math.min(1.0, Math.max(0.05, next.vibrationG));
    }

    if (
      next.activeFault === 'BEARING_WEAR' &&
      !next.recoveryTargetReached &&
      (i === 11 || i === 12)
    ) {
      binVal = Math.max(binVal, 0.78 + Math.random() * 0.15);
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
