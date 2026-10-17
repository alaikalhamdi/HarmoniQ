import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  ActuationCommand,
  SimulationResult,
  TelemetryFrame,
  VerifierBackend,
} from './types';
import { verifyPolicyInSandbox } from './simulator';

const VERIFIER_SCRIPT = path.join(process.cwd(), 'jobs', 'policy-verifier', 'verifier.py');
const LOCAL_TIMEOUT_MS = 5000;

const PYTHON_CANDIDATES =
  process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];

const TERMINAL_JOB_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

interface RawVerifierOutput {
  verified?: unknown;
  predictedTempC?: unknown;
  predictedVibrationG?: unknown;
  predictedCurrentMa?: unknown;
  safetyMarginPercent?: unknown;
}

interface NebiusJobConfig {
  projectId: string;
  image: string;
  token: string;
  apiBaseUrl: string;
  platform: string;
  preset: string;
  subnetId?: string;
  diskBytes: number;
  pollBudgetMs: number;
  pollIntervalMs: number;
}

export interface VerifierDispatch {
  result: SimulationResult;
  backend: VerifierBackend;
  jobId?: string;
  jobState?: string;
}

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  failedToStart: boolean;
}

function readNebiusJobConfig(): NebiusJobConfig | null {
  const projectId = process.env.NEBIUS_PROJECT_ID;
  const image = process.env.NEBIUS_JOB_IMAGE;
  const token = process.env.NEBIUS_IAM_TOKEN;
  const platform = process.env.NEBIUS_JOB_PLATFORM;
  const preset = process.env.NEBIUS_JOB_PRESET;

  if (!projectId || projectId.includes('your_nebius_project_id')) return null;
  if (!image || !token || !platform || !preset) return null;

  return {
    projectId,
    image,
    token,
    apiBaseUrl: process.env.NEBIUS_CLOUD_API_URL || 'https://api.nebius.cloud',
    platform,
    preset,
    subnetId: process.env.NEBIUS_JOB_SUBNET_ID || undefined,
    diskBytes: Number(process.env.NEBIUS_JOB_DISK_BYTES) || 21474836480,
    pollBudgetMs: Number(process.env.NEBIUS_JOB_POLL_BUDGET_MS) || 8000,
    pollIntervalMs: Number(process.env.NEBIUS_JOB_POLL_INTERVAL_MS) || 1500,
  };
}

function runProcess(bin: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.on('error', () => finish({ code: null, stdout, stderr, failedToStart: true }));
    child.on('close', (code) => finish({ code, stdout, stderr, failedToStart: false }));
  });
}

function parseVerifierStdout(stdout: string): RawVerifierOutput | null {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as RawVerifierOutput;
  } catch {
    return null;
  }
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toSimulationResult(
  raw: RawVerifierOutput,
  meta: { backend: VerifierBackend; executionTimeMs: number; jobId?: string; jobState?: string }
): SimulationResult {
  return {
    verified: raw.verified === true,
    predictedTempC: asNumber(raw.predictedTempC, 0),
    predictedVibrationG: asNumber(raw.predictedVibrationG, 0),
    predictedCurrentMa: asNumber(raw.predictedCurrentMa, 0),
    safetyMarginPercent: asNumber(raw.safetyMarginPercent, 0),
    verifierBackend: meta.backend,
    executionTimeMs: meta.executionTimeMs,
    jobId: meta.jobId,
    jobState: meta.jobState,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Executes the exact container-entrypoint verifier (jobs/policy-verifier/verifier.py)
// as a subprocess so the packaged image logic is exercised at runtime, not a reimplementation.
async function runLocalContainerVerifier(
  frame: TelemetryFrame,
  command: ActuationCommand
): Promise<SimulationResult> {
  const startTime = performance.now();
  const payload = JSON.stringify({ metrics: frame.metrics, command });

  for (const bin of PYTHON_CANDIDATES) {
    const proc = await runProcess(bin, [VERIFIER_SCRIPT, '--payload', payload], LOCAL_TIMEOUT_MS);
    if (proc.failedToStart) continue;

    const parsed = parseVerifierStdout(proc.stdout);
    if (parsed) {
      return toSimulationResult(parsed, {
        backend: 'LOCAL_CONTAINER',
        executionTimeMs: Math.round(performance.now() - startTime),
      });
    }

    break;
  }

  throw new Error('Local container verifier unavailable');
}

async function submitNebiusJob(
  frame: TelemetryFrame,
  command: ActuationCommand,
  config: NebiusJobConfig
): Promise<string> {
  const payload = Buffer.from(
    JSON.stringify({ metrics: frame.metrics, command }),
    'utf8'
  ).toString('base64');

  const body = {
    metadata: {
      parentId: config.projectId,
      name: `harmoniq-verify-${Date.now()}`,
    },
    spec: {
      image: config.image,
      containerCommand: 'python3',
      args: '/app/verifier.py --file /app/payload.json',
      platform: config.platform,
      preset: config.preset,
      timeout: '3600s',
      ...(config.subnetId ? { subnetId: config.subnetId } : {}),
      disk: { type: 'NETWORK_SSD', sizeBytes: String(config.diskBytes) },
      injectedFiles: [{ containerPath: '/app/payload.json', content: payload }],
    },
  };

  const res = await fetch(`${config.apiBaseUrl}/ai/v1/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Nebius job submit failed (${res.status})`);
  }

  const data = (await res.json()) as { resourceId?: string };
  if (!data.resourceId) {
    throw new Error('Nebius job submit did not return a resourceId');
  }
  return data.resourceId;
}

async function fetchNebiusJobState(
  jobId: string,
  config: NebiusJobConfig
): Promise<string | null> {
  const res = await fetch(`${config.apiBaseUrl}/ai/v1/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { status?: { state?: string } };
  return data.status?.state ?? null;
}

async function cancelNebiusJob(jobId: string, config: NebiusJobConfig): Promise<void> {
  try {
    await fetch(`${config.apiBaseUrl}/ai/v1/jobs/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: jobId }),
    });
  } catch {
    // Best-effort cleanup; ignore.
  }
}

async function runRemoteNebiusVerifier(
  frame: TelemetryFrame,
  command: ActuationCommand,
  config: NebiusJobConfig
): Promise<VerifierDispatch> {
  const startTime = performance.now();
  const jobId = await submitNebiusJob(frame, command, config);

  const deadline = startTime + config.pollBudgetMs;
  let state: string | null = null;

  while (performance.now() < deadline) {
    state = await fetchNebiusJobState(jobId, config);
    if (state && TERMINAL_JOB_STATES.has(state)) break;
    await sleep(config.pollIntervalMs);
  }

  if (!state || !TERMINAL_JOB_STATES.has(state)) {
    // The job is still queued/running. Reclaim cost and let the caller fall back to a
    // local verifier rather than blocking the actuation pipeline for minutes.
    await cancelNebiusJob(jobId, config);
    throw new Error('Nebius job did not reach a terminal state within the poll budget');
  }

  // The container exits non-zero when the policy violates SOA bounds, so the job's
  // terminal state is an authoritative pass/fail gate. Predicted metrics come from the
  // identical deterministic engine running locally.
  const local = await verifyPolicyInSandbox(frame, command);

  const result: SimulationResult = {
    ...local,
    verified: state === 'COMPLETED',
    verifierBackend: 'NEBIUS_SERVERLESS_JOB',
    executionTimeMs: Math.round(performance.now() - startTime),
    jobId,
    jobState: state,
  };

  return { result, backend: 'NEBIUS_SERVERLESS_JOB', jobId, jobState: state };
}

// Resolves the strongest available verifier backend:
// 1. Real Nebius Serverless Job (opt-in via NEBIUS_VERIFIER_REMOTE=true, fully configured).
// 2. Local execution of the packaged container verifier (verifier.py).
// 3. In-process TypeScript state-space engine (always available).
export async function verifyPolicyWithDispatch(
  frame: TelemetryFrame,
  command: ActuationCommand
): Promise<VerifierDispatch> {
  const remoteEnabled = process.env.NEBIUS_VERIFIER_REMOTE === 'true';
  const config = readNebiusJobConfig();

  if (remoteEnabled && config) {
    try {
      return await runRemoteNebiusVerifier(frame, command, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.warn(`[verifier] Remote Nebius job unavailable (${message}); falling back to local.`);
    }
  }

  try {
    const result = await runLocalContainerVerifier(frame, command);
    return { result, backend: 'LOCAL_CONTAINER' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[verifier] Local container verifier unavailable (${message}); using TS engine.`);
  }

  const result = await verifyPolicyInSandbox(frame, command);
  return { result, backend: 'LOCAL_STATE_SPACE' };
}
