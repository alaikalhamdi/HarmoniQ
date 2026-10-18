export type OperatingMode = 'HARDWARE_LIVE' | 'SYNTHETIC_TWIN';

export type FaultMode = 'NONE' | 'BEARING_WEAR' | 'VOLTAGE_BROWNOUT' | 'THERMAL_RUNAWAY';

export type TriageStatus = 'NOMINAL' | 'WARNING' | 'FAULT';

export type ActuationAction = 
  | 'SET_PWM'
  | 'RECALIBRATE_PID'
  | 'ENGAGE_CURRENT_LIMIT'
  | 'EMERGENCY_CUTOFF';

export interface TelemetryMetrics {
  supplyVoltageV: number;
  currentDrawMa: number;
  temperatureC: number;
  pwmDutyCycle: number;
  fftDominantFreqHz: number;
  fftPeakMagnitude: number;
  fftBins: number[];
}

export interface TelemetryFrame {
  timestamp: number;
  deviceId: string;
  mode: OperatingMode;
  metrics: TelemetryMetrics;
}

export interface TriageAssessment {
  status: TriageStatus;
  faultSignature: string;
  confidence: number;
  targetComponent: string;
  triageLatencyMs: number;
  modelUsed: string;
}

export interface TavilyDatasheetCitation {
  component: string;
  title: string;
  url: string;
  snippet: string;
  limits: {
    maxVoltageV?: number;
    maxCurrentMa?: number;
    maxTempC?: number;
    safeOperatingArea?: string;
    recommendedMitigation?: string;
  };
}

export interface SafetyLimitOverrides {
  maxSafeTempC?: number;
  maxSafeCurrentMa?: number;
  maxSafeVibrationG?: number;
  limitSource?: string;
}

export interface ActuationCommand {
  commandId: string;
  targetDeviceId: string;
  action: ActuationAction;
  parameters: {
    targetPwm?: number;
    kp?: number;
    ki?: number;
    kd?: number;
    currentLimitMa?: number;
    reason: string;
  };
  extractedLimits?: SafetyLimitOverrides;
  verifiedBySimulation: boolean;
  modelChainUsed: string[];
  timestamp: number;
}

export interface DiagnosisReport {
  rootCause: string;
  severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
  confidence: number;
  justification: string;
  modelUsed: string;
  citations: TavilyDatasheetCitation[];
  extractedLimits?: SafetyLimitOverrides;
  recommendedCommand: ActuationCommand;
  diagnosisLatencyMs: number;
}

export type VerifierBackend =
  | 'NEBIUS_SERVERLESS_JOB'
  | 'LOCAL_CONTAINER'
  | 'LOCAL_STATE_SPACE';

export interface SimulationResult {
  verified: boolean;
  predictedTempC: number;
  predictedVibrationG: number;
  predictedCurrentMa: number;
  safetyMarginPercent: number;
  verifierBackend: VerifierBackend;
  executionTimeMs: number;
  jobId?: string;
  jobState?: string;
}

export interface AgentTraceEvent {
  id: string;
  timestamp: number;
  stage: 'TRIAGE_NANO' | 'DATASHEET_TAVILY' | 'POLICY_ULTRA' | 'SIMULATION_VERIFY' | 'ACTUATION_DISPATCH';
  status: 'SUCCESS' | 'WARNING' | 'FAILED' | 'SKIPPED';
  latencyMs: number;
  description: string;
  details: Record<string, unknown>;
}

export interface FinOpsStats {
  tier1Calls: number;
  tier2Calls: number;
  totalFramesProcessed: number;
  filteredNominalPercent: number;
  estimatedCostSavingsUsd: number;
  averageTriageLatencyMs: number;
  activeTier1Model: string;
  activeTier2Model: string;
  inferenceSource: 'NEBIUS_LIVE' | 'FALLBACK_SIM';
}

export interface RigHardwareComponent {
  partNumber: string;
  category: string;
  nominalSpecs: string;
  criticalLimits: {
    maxTempC: number;
    maxVoltageV: number;
    maxCurrentMa: number;
    nominalFftPeakHz: number;
  };
  typicalFailureModes: string[];
}

export const RIG_HARDWARE_BOM: Record<string, RigHardwareComponent> = {
  'ESP32-S3': {
    partNumber: 'ESP32-S3-WROOM-1',
    category: 'Edge Compute MCU',
    nominalSpecs: 'Dual-core Xtensa LX7 @ 240MHz, 512KB SRAM, hardware I2C/SPI/ADC',
    criticalLimits: {
      maxTempC: 85,
      maxVoltageV: 3.6,
      maxCurrentMa: 500,
      nominalFftPeakHz: 120,
    },
    typicalFailureModes: ['Brownout reboot', 'ADC saturation', 'Thermal throttling'],
  },
  'IRF540N': {
    partNumber: 'IRF540NPBF',
    category: 'Power Switching N-MOSFET',
    nominalSpecs: '100V Vds, 33A Id (28A IRF540), 44mOhm Rds(on), TO-220AB package, Tj max 175C',
    criticalLimits: {
      maxTempC: 85, // 85C continuous design derating margin (datasheet Tj max 175C)
      maxVoltageV: 100,
      maxCurrentMa: 33000,
      nominalFftPeakHz: 120,
    },
    typicalFailureModes: ['Thermal runaway at high duty cycle', 'Gate oxide punch-through', 'SOA violation'],
  },
  'DRV8833': {
    partNumber: 'DRV8833PWP',
    category: 'Dual H-Bridge Motor Driver',
    nominalSpecs: '2.7V - 10.8V operating rail, 1.5A RMS / 2A peak per bridge, current regulation',
    criticalLimits: {
      maxTempC: 95,
      maxVoltageV: 10.8,
      maxCurrentMa: 2000,
      nominalFftPeakHz: 120,
    },
    typicalFailureModes: ['Supply rail brownout sag', 'Overcurrent shutdown', 'Cross-conduction ripple'],
  },
  'INA219': {
    partNumber: 'INA219BIDR',
    category: 'Bidirectional Current/Power Monitor',
    nominalSpecs: 'I2C digital output, 0V - 26V common mode, 0.1 Ohm shunt calibration',
    criticalLimits: {
      maxTempC: 105,
      maxVoltageV: 26.0,
      maxCurrentMa: 3200,
      nominalFftPeakHz: 120,
    },
    typicalFailureModes: ['Shunt thermal drift', 'I2C bus lockup during brownout'],
  },
  'MPU6050': {
    partNumber: 'MPU-6050',
    category: '6-DoF IMU & Vibration Sensor',
    nominalSpecs: 'Tri-axis accelerometer (+-2g to +-16g), 1kHz internal sample rate',
    criticalLimits: {
      maxTempC: 85,
      maxVoltageV: 3.6,
      maxCurrentMa: 5,
      nominalFftPeakHz: 120,
    },
    typicalFailureModes: ['Secondary harmonic resonance from bearing wear', 'Sensor clipping during mechanical shock'],
  },
};
