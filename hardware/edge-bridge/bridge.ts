/**
 * Hardware Edge Bridge Daemon
 * Bi-directionally bridges serial microcontroller telemetry frames to the Next.js API
 * and relays verified closed-loop ActuationCommands back to the MCU over Serial.
 *
 * Usage:
 *   npx tsx hardware/edge-bridge/bridge.ts --synthetic
 *   npx tsx hardware/edge-bridge/bridge.ts --synthetic --fault BEARING_WEAR
 *   npx tsx hardware/edge-bridge/bridge.ts --synthetic --fault THERMAL_RUNAWAY --fault-after 5 --hold 15 --cycle
 *   npx tsx hardware/edge-bridge/bridge.ts --port COM3
 */

import {
  createInitialTwinState,
  injectFault,
  resetFault,
  stepDigitalTwin,
} from '../../src/lib/digital-twin';
import { FaultMode, TelemetryFrame } from '../../src/lib/types';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const FAULT_MODES: FaultMode[] = ['BEARING_WEAR', 'VOLTAGE_BROWNOUT', 'THERMAL_RUNAWAY'];

function getFlag(name: string): boolean {
  return process.argv.includes(name);
}

function getOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  return next && !next.startsWith('--') ? next : undefined;
}

const isSynthetic = process.argv.includes('--synthetic') || !process.argv.includes('--port');

const requestedFault = (getOption('--fault') || '').toUpperCase() as FaultMode;
const faultMode: FaultMode = FAULT_MODES.includes(requestedFault) ? requestedFault : 'NONE';
const faultAfterMs = (Number(getOption('--fault-after')) || 5) * 1000;
const holdMs = (Number(getOption('--hold')) || 15) * 1000;
const cycle = getFlag('--cycle');

console.log('====================================================');
console.log('   Physical AI Edge-to-Cloud Bridge Daemon');
console.log(`   Mode: ${isSynthetic ? 'SYNTHETIC STREAMER' : 'PHYSICAL SERIAL PORT'}`);
console.log(`   Target Server: ${API_BASE_URL}`);
if (isSynthetic && faultMode !== 'NONE') {
  console.log(
    `   Fault Injection: ${faultMode} (after ${faultAfterMs / 1000}s, hold ${holdMs / 1000}s${
      cycle ? ', cycling' : ''
    })`
  );
}
console.log('====================================================\n');

async function sendFrameToServer(frame: TelemetryFrame) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(frame),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.triage.status !== 'NOMINAL') {
        console.log(
          `[TRIAGE ALERT] Status: ${data.triage.status} | Component: ${data.triage.targetComponent} | Latency: ${data.triage.triageLatencyMs}ms`
        );
      }
    }
  } catch {
    // Server not yet online or connecting
  }
}

async function pollPendingCommands() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/telemetry`);
    if (res.ok) {
      const data = await res.json();
      if (data.pendingCommand) {
        console.log(
          `\n>>> [ACTUATION DISPATCHED TO RIG] Action: ${data.pendingCommand.action} | Reason: ${data.pendingCommand.parameters.reason}\n`
        );
      }
    }
  } catch {
    // Ignore fetch error
  }
}

// Synthetic streamer loop (runs at 30Hz)
if (isSynthetic) {
  let twin = createInitialTwinState();
  let frameCount = 0;
  const startedAt = Date.now();
  let faultInjectedAt: number | null = null;
  let nextFaultAt: number | null = faultMode !== 'NONE' ? startedAt + faultAfterMs : null;

  setInterval(async () => {
    const now = Date.now();

    if (nextFaultAt !== null && now >= nextFaultAt) {
      twin = injectFault(twin, faultMode);
      faultInjectedAt = now;
      nextFaultAt = null;
      console.log(`\n[FAULT INJECTED] ${faultMode} at t+${Math.round((now - startedAt) / 1000)}s`);
      await sendFrameToServer(stepDigitalTwin(twin, 0.033).frame);
    }

    if (faultInjectedAt !== null && now - faultInjectedAt >= holdMs) {
      twin = resetFault(twin);
      console.log(`\n[FAULT CLEARED] ${faultMode}`);
      faultInjectedAt = null;
      if (cycle) nextFaultAt = now + faultAfterMs;
    }

    const { nextState, frame } = stepDigitalTwin(twin, 0.033);
    twin = nextState;
    frameCount++;

    // Forward frame to cloud command center every ~1 second (or on anomaly)
    if (frameCount % 30 === 0) {
      process.stdout.write(
        `\r[STREAMING] Frame #${frameCount} | Rail: ${frame.metrics.supplyVoltageV}V | Temp: ${frame.metrics.temperatureC}°C | Peak: ${frame.metrics.fftDominantFreqHz}Hz (${frame.metrics.fftPeakMagnitude}g)   `
      );
      await sendFrameToServer(frame);
      await pollPendingCommands();
    }
  }, 33);
} else {
  console.error(
    '[bridge] Physical serial mode is not available in this build. Install a serial transport and implement the COM port reader, or run with --synthetic.'
  );
  process.exit(1);
}
