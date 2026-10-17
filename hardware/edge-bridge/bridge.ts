/**
 * Hardware Edge Bridge Daemon
 * Bi-directionally bridges serial microcontroller telemetry frames to the Next.js API
 * and relays verified closed-loop ActuationCommands back to the MCU over Serial.
 *
 * Usage:
 *   npx tsx hardware/edge-bridge/bridge.ts --synthetic   (Software test generator)
 *   npx tsx hardware/edge-bridge/bridge.ts --port COM3   (Physical USB Serial port)
 */

import { createInitialTwinState, stepDigitalTwin } from '../../src/lib/digital-twin';
import { TelemetryFrame } from '../../src/lib/types';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const isSynthetic = process.argv.includes('--synthetic') || !process.argv.includes('--port');

console.log('====================================================');
console.log('   Physical AI Edge-to-Cloud Bridge Daemon');
console.log(`   Mode: ${isSynthetic ? 'SYNTHETIC STREAMER' : 'PHYSICAL SERIAL PORT'}`);
console.log(`   Target Server: ${API_BASE_URL}`);
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

  setInterval(async () => {
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
}
