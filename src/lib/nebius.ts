import OpenAI from 'openai';
import { telemetryStore } from './store';
import {
  ActuationCommand,
  DiagnosisReport,
  TavilyDatasheetCitation,
  TelemetryFrame,
  TriageAssessment,
} from './types';

// Default model slugs conforming to Nebius Token Factory & NVIDIA model registry
const DEFAULT_TIER1_MODEL = 'nvidia/Nemotron-3-Nano-30B';
const DEFAULT_TIER2_MODEL = 'nvidia/Nemotron-3-Ultra-550b-a55b';

let cachedTier1Model: string | null = null;
let cachedTier2Model: string | null = null;
let modelsDiscovered = false;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey || apiKey.includes('your_nebius_token_factory_key')) {
    return null;
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1',
  });
}

export async function resolveNemotronModels(): Promise<{
  tier1: string;
  tier2: string;
  isLive: boolean;
}> {
  if (process.env.NEBIUS_TIER1_MODEL && process.env.NEBIUS_TIER2_MODEL) {
    return {
      tier1: process.env.NEBIUS_TIER1_MODEL,
      tier2: process.env.NEBIUS_TIER2_MODEL,
      isLive: true,
    };
  }

  if (cachedTier1Model && cachedTier2Model) {
    return {
      tier1: cachedTier1Model,
      tier2: cachedTier2Model,
      isLive: true,
    };
  }

  const client = getOpenAIClient();
  if (!client) {
    return {
      tier1: DEFAULT_TIER1_MODEL,
      tier2: DEFAULT_TIER2_MODEL,
      isLive: false,
    };
  }

  if (!modelsDiscovered) {
    try {
      const list = await client.models.list();
      const modelIds = list.data.map((m) => m.id);

      // Resolve fastest Tier-1 Nano / Lightning model
      const nanoMatch = modelIds.find(
        (id) =>
          id.toLowerCase().includes('nano') ||
          id.toLowerCase().includes('lightning') ||
          id.toLowerCase().includes('8b')
      );
      cachedTier1Model = nanoMatch || DEFAULT_TIER1_MODEL;

      // Resolve deepest Tier-2 Ultra / Super model
      const ultraMatch = modelIds.find(
        (id) =>
          id.toLowerCase().includes('ultra') ||
          id.toLowerCase().includes('super') ||
          id.toLowerCase().includes('550b') ||
          id.toLowerCase().includes('120b')
      );
      cachedTier2Model = ultraMatch || DEFAULT_TIER2_MODEL;

      modelsDiscovered = true;
    } catch {
      cachedTier1Model = DEFAULT_TIER1_MODEL;
      cachedTier2Model = DEFAULT_TIER2_MODEL;
    }
  }

  return {
    tier1: cachedTier1Model || DEFAULT_TIER1_MODEL,
    tier2: cachedTier2Model || DEFAULT_TIER2_MODEL,
    isLive: true,
  };
}

export async function runTier1Triage(frame: TelemetryFrame): Promise<TriageAssessment> {
  const startTime = performance.now();
  const { tier1, isLive } = await resolveNemotronModels();
  const client = getOpenAIClient();

  // If live Nebius client is available, call Tier-1 model
  if (isLive && client) {
    try {
      const systemPrompt = `You are an ultra-fast hardware telemetry triage system for an edge microcontroller rig.
Evaluate the incoming telemetry frame in <150ms.
Component Safe Operating Limits:
- Supply Voltage: nominal 12.0V, minimum 10.0V (DRV8833 UVLO trigger is <9.0V).
- Current Draw: nominal <500mA, maximum 1200mA.
- Temperature: nominal <50C, maximum 85C (IRF540N MOSFET thermal runaway >105C).
- Vibration FFT: nominal peak harmonic <0.35g, nominal fundamental ~120Hz. Bearing wear defect frequencies occur at >300Hz (harmonic resonance ~385Hz).

Respond strictly with valid JSON conforming to:
{
  "status": "NOMINAL" | "WARNING" | "FAULT",
  "faultSignature": string,
  "confidence": number,
  "targetComponent": "ESP32-S3" | "IRF540N" | "DRV8833" | "INA219" | "MPU6050" | "NONE"
}`;

      const response = await client.chat.completions.create({
        model: tier1,
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Telemetry Frame: ${JSON.stringify(frame.metrics)}`,
          },
        ],
      });

      const latency = Math.round(performance.now() - startTime);
      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        const assessment: TriageAssessment = {
          status: parsed.status || 'NOMINAL',
          faultSignature: parsed.faultSignature || 'Telemetry evaluation completed',
          confidence: parsed.confidence || 0.95,
          targetComponent: parsed.targetComponent || 'NONE',
          triageLatencyMs: latency,
          modelUsed: tier1,
        };

        telemetryStore.updateFinOps({
          tier1Calls: telemetryStore.getFinOpsStats().tier1Calls + 1,
          activeTier1Model: tier1,
          inferenceSource: 'NEBIUS_LIVE',
          averageTriageLatencyMs: latency,
        });

        return assessment;
      }
    } catch {
      // Fall through to deterministic fallback if inference fails
    }
  }

  // Deterministic fast fallback analyzer
  const latency = Math.max(12, Math.round(performance.now() - startTime));
  const m = frame.metrics;

  let status: 'NOMINAL' | 'WARNING' | 'FAULT' = 'NOMINAL';
  let faultSignature = 'All physical parameters within Safe Operating Area limits';
  let targetComponent = 'NONE';
  let confidence = 0.99;

  if (m.temperatureC >= 95.0) {
    status = 'FAULT';
    faultSignature = `Power stage thermal runaway: MOSFET junction temperature ${m.temperatureC}C exceeds 85C SOA continuous threshold`;
    targetComponent = 'IRF540N';
    confidence = 0.98;
  } else if (m.temperatureC >= 70.0) {
    status = 'WARNING';
    faultSignature = `Elevated power stage temperature (${m.temperatureC}C) approaching linear derating threshold`;
    targetComponent = 'IRF540N';
    confidence = 0.92;
  } else if (m.supplyVoltageV <= 9.2 || m.currentDrawMa >= 1200) {
    status = 'FAULT';
    faultSignature = `Supply rail brownout sag (${m.supplyVoltageV}V) with inductive current surge (${m.currentDrawMa}mA)`;
    targetComponent = 'DRV8833';
    confidence = 0.96;
  } else if (m.supplyVoltageV <= 10.5) {
    status = 'WARNING';
    faultSignature = `Transient supply rail sag to ${m.supplyVoltageV}V approaching UVLO limit`;
    targetComponent = 'DRV8833';
    confidence = 0.91;
  } else if (m.fftDominantFreqHz >= 320 && m.fftPeakMagnitude >= 0.55) {
    status = 'FAULT';
    faultSignature = `High-frequency harmonic resonance at ${m.fftDominantFreqHz}Hz (${m.fftPeakMagnitude}g) indicating bearing outer raceway defect`;
    targetComponent = 'MPU6050';
    confidence = 0.97;
  } else if (m.fftPeakMagnitude >= 0.40) {
    status = 'WARNING';
    faultSignature = `Vibration magnitude elevated (${m.fftPeakMagnitude}g) above nominal 0.30g baseline`;
    targetComponent = 'MPU6050';
    confidence = 0.89;
  }

  const assessment: TriageAssessment = {
    status,
    faultSignature,
    confidence,
    targetComponent,
    triageLatencyMs: latency,
    modelUsed: tier1,
  };

  telemetryStore.updateFinOps({
    tier1Calls: telemetryStore.getFinOpsStats().tier1Calls + 1,
    activeTier1Model: tier1,
    inferenceSource: 'FALLBACK_SIM',
    averageTriageLatencyMs: latency,
  });

  return assessment;
}

export async function runTier2Diagnosis(
  frame: TelemetryFrame,
  triage: TriageAssessment,
  citations: TavilyDatasheetCitation[]
): Promise<DiagnosisReport> {
  const startTime = performance.now();
  const { tier2, isLive } = await resolveNemotronModels();
  const client = getOpenAIClient();

  if (isLive && client) {
    try {
      const systemPrompt = `You are an expert physical AI diagnostics and controls engineer.
You are diagnosing an anomalous physical edge rig based on telemetry and manufacturer datasheets retrieved via Tavily.
Your task:
1. Identify the root cause by cross-referencing telemetry with datasheet safe operating area (SOA) curves.
2. Synthesize a corrective ActuationCommand to stabilize the hardware.
Actions available: 'SET_PWM' (reduce duty cycle 0-255), 'RECALIBRATE_PID' (tune kp, ki, kd), 'ENGAGE_CURRENT_LIMIT' (limit in mA), 'EMERGENCY_CUTOFF'.

Respond strictly with valid JSON in this schema:
{
  "rootCause": string,
  "severity": "LOW" | "MEDIUM" | "CRITICAL",
  "confidence": number,
  "justification": string,
  "recommendedCommand": {
    "action": "SET_PWM" | "RECALIBRATE_PID" | "ENGAGE_CURRENT_LIMIT" | "EMERGENCY_CUTOFF",
    "parameters": {
      "targetPwm": number,
      "kp": number,
      "ki": number,
      "kd": number,
      "currentLimitMa": number,
      "reason": string
    }
  }
}`;

      const response = await client.chat.completions.create({
        model: tier2,
        temperature: 0.2,
        max_tokens: 650,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Telemetry Frame: ${JSON.stringify(frame.metrics)}
Triage Finding: ${JSON.stringify(triage)}
Tavily Datasheet Grounding: ${JSON.stringify(citations)}`,
          },
        ],
      });

      const latency = Math.round(performance.now() - startTime);
      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        const command: ActuationCommand = {
          commandId: `CMD-${Date.now()}`,
          targetDeviceId: frame.deviceId,
          action: parsed.recommendedCommand.action || 'SET_PWM',
          parameters: parsed.recommendedCommand.parameters || {
            targetPwm: 100,
            reason: 'Grounding-directed parameter derate',
          },
          verifiedBySimulation: false,
          modelChainUsed: [triage.modelUsed, tier2],
          timestamp: Date.now(),
        };

        const report: DiagnosisReport = {
          rootCause: parsed.rootCause,
          severity: parsed.severity || 'MEDIUM',
          confidence: parsed.confidence || 0.95,
          justification: parsed.justification,
          modelUsed: tier2,
          citations,
          recommendedCommand: command,
          diagnosisLatencyMs: latency,
        };

        telemetryStore.updateFinOps({
          tier2Calls: telemetryStore.getFinOpsStats().tier2Calls + 1,
          activeTier2Model: tier2,
        });

        return report;
      }
    } catch {
      // Fall through to deterministic fallback if inference fails
    }
  }

  // Deterministic grounded synthesis fallback
  const latency = Math.max(45, Math.round(performance.now() - startTime));
  const m = frame.metrics;
  const citation = citations[0] || {
    title: 'Hardware Safe Operating Limits',
    limits: { recommendedMitigation: 'Derate PWM duty cycle' },
  };

  let rootCause = 'Component operating parameters exceeded safe threshold';
  let severity: 'LOW' | 'MEDIUM' | 'CRITICAL' = 'MEDIUM';
  let action: 'SET_PWM' | 'RECALIBRATE_PID' | 'ENGAGE_CURRENT_LIMIT' | 'EMERGENCY_CUTOFF' = 'SET_PWM';
  let parameters: ActuationCommand['parameters'] = {
    targetPwm: 110,
    reason: 'Derating PWM to bring power stage back inside Safe Operating Area',
  };
  let justification = `Datasheet specifications from ${citation.title} require immediate intervention to prevent structural damage.`;

  if (m.temperatureC >= 95.0) {
    severity = 'CRITICAL';
    rootCause = `Thermal runaway on IRF540N MOSFET. Junction temperature of ${m.temperatureC}C exceeds the continuous 85C SOA limit, causing exponential Rds(on) resistance rise and current saturation.`;
    action = 'SET_PWM';
    parameters = {
      targetPwm: 85,
      reason: 'Derate PWM from 200 to 85 (33% duty cycle) to allow junction heat dissipation',
    };
    justification = `Per Vishay IRF540N datasheet, linear derating of 0.73 W/C above 25C mandates operating duty cycle reduction under elevated thermal load to avoid permanent gate puncture.`;
  } else if (m.supplyVoltageV <= 9.2 || m.currentDrawMa >= 1200) {
    severity = 'CRITICAL';
    rootCause = `Supply rail brownout sag (${m.supplyVoltageV}V) with inductive current draw (${m.currentDrawMa}mA) nearing DRV8833 UVLO trip point (8.5V).`;
    action = 'ENGAGE_CURRENT_LIMIT';
    parameters = {
      currentLimitMa: 650,
      targetPwm: 140,
      reason: 'Enforce 650mA current clamp to stabilize supply voltage rail above UVLO lockout',
    };
    justification = `Per TI DRV8833 datasheet, supply voltage drops below 9V during stall induce UVLO cycling and back-EMF spikes. Clamping current draw preserves logic rail stability.`;
  } else if (m.fftDominantFreqHz >= 320) {
    severity = 'MEDIUM';
    rootCause = `Mechanical bearing raceway wear generating secondary harmonic resonance at ${m.fftDominantFreqHz}Hz with ${m.fftPeakMagnitude}g peak acceleration.`;
    action = 'RECALIBRATE_PID';
    parameters = {
      kp: 0.85,
      ki: 0.02,
      kd: 0.45,
      targetPwm: 130,
      reason: 'Increase PID derivative damping (Kd=0.45) and derate speed to decouple harmonic excitation',
    };
    justification = `Per MPU-6050 vibration analysis specs, secondary harmonics above 300Hz indicate bearing cage defect. Increasing loop damping suppresses resonant energy transfer.`;
  }

  const command: ActuationCommand = {
    commandId: `CMD-${Date.now()}`,
    targetDeviceId: frame.deviceId,
    action,
    parameters,
    verifiedBySimulation: false,
    modelChainUsed: [triage.modelUsed, tier2],
    timestamp: Date.now(),
  };

  const report: DiagnosisReport = {
    rootCause,
    severity,
    confidence: 0.96,
    justification,
    modelUsed: tier2,
    citations,
    recommendedCommand: command,
    diagnosisLatencyMs: latency,
  };

  telemetryStore.updateFinOps({
    tier2Calls: telemetryStore.getFinOpsStats().tier2Calls + 1,
    activeTier2Model: tier2,
  });

  return report;
}
