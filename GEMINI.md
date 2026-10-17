# Project Handover Brief: Edge-to-Cloud Predictive Maintenance & Fault Recovery Agent

## 1. Executive Summary & Hackathon Context

* **Competition:** Nebius x NVIDIA Global AI Hackathon (Devpost)
* **Hard Deadline:** October 30, 2026 @ 10:00 AM PDT
* **Target Track:** **Physical AI Track** (+ competing for the **$3,000 Best Use of Tavily** sponsor prize)
* **Core Objective:** Build an embodied edge-to-cloud closed-loop AI system that ingests real-time microcontroller/sensor telemetry (vibration FFT harmonics, voltage/load-dump transients, thermal data), triages anomalies at sub-second latency using tiered **NVIDIA Nemotron** models on **Nebius Token Factory**, grounds diagnostics in live hardware datasheets via **Tavily**, verifies safe parameter adjustments via **Nebius Serverless Jobs**, and dispatches corrective actuation commands back to the physical hardware.
* **Mandatory Hackathon Compliance:**
1. Must make runtime inference calls to **Nebius Token Factory** (`[https://api.tokenfactory.nebius.com/v1](https://api.tokenfactory.nebius.com/v1)`) or run on **Nebius AI Cloud** (Serverless Endpoints / Serverless Jobs).
2. Must use **NVIDIA Open-Source Models** (`Nemotron 3 Nano/Lightning`, `Nemotron 3 Super`, `Nemotron 3 Ultra`, and/or `Cosmos`/`GR00T`).
3. **Physical AI Video Rule:** The 3-minute submission video **must** include at least a **1-minute continuous clip** showing the physical hardware/rig operating and responding to the agent in real time (or key simulation/application modules executing if running in software-only mode).
4. **Repository Rule:** Public GitHub repository with an explicit open-source license (`MIT` or `Apache-2.0`) visible in the top-level GitHub "About" section.



---

## 2. System Architecture & Data Flow

```
[Physical Edge Node / MCU Rig] 
  │  (C++ Firmware: ADC Sampling -> Local FFT / Voltage & Thermal Telemetry)
  │  (Serial / WebSocket / MQTT Stream @ 10-50Hz)
  ▼
[Next.js Full-Stack Telemetry & Agent Studio (App Router + Tailwind + Supabase)]
  │
  ├──► 1. FAST TRIAGE LAYER (Nebius Token Factory)
  │       Model: nvidia/Nemotron-3_5-Lightning (or Nemotron-3-Nano-30B)
  │       Task: Evaluates sliding-window FFT peaks & voltage rails in <150ms.
  │       Output: Structured JSON { status: "NOMINAL" | "WARNING" | "FAULT", fault_signature }
  │
  ├──► 2. DATASHEET & ERRATA GROUNDING (Tavily Search API)
  │       Trigger: Executed when Triage status == "WARNING" or "FAULT"
  │       Task: Queries live manufacturer datasheets, safe operating area (SOA) curves, 
  │             and thermal derating limits for the exact hardware components in the rig.
  │
  ├──► 3. DEEP ROOT-CAUSE & POLICY SYNTHESIS (Nebius Token Factory)
  │       Model: nvidia/Nemotron-3-Ultra-550b-a55b (or nemotron-3-super-120b-a12b)
  │       Task: Cross-references FFT harmonic signatures + Tavily datasheet constraints 
  │             to synthesize a safe recovery policy (e.g., PWM duty-cycle derating, 
  │             PID gain retuning, or load shedding).
  │
  └──► 4. SANDBOX SIMULATION & HARDWARE ACTUATION (Nebius Serverless Jobs)
          Task: Validates proposed control parameters against a synthetic state model 
                in an async container job; once verified, pushes the JSON control command 
                back to the MCU to stabilize the physical system.

```

---

## 3. Recommended Tech Stack & Environment Setup

### Frontend & Orchestration Backend

* **Framework:** Next.js (App Router, TypeScript), Tailwind CSS, Lucide Icons, Recharts / Canvas for high-frequency real-time waveform & FFT spectrum plotting.
* **Database & State:** Supabase (PostgreSQL + Realtime channels for logging telemetry frames, agent reasoning traces, token usage metrics, and hardware actuation history).
* **AI SDKs:** `openai` (configured with Nebius Token Factory `baseURL`), `@tavily/core` (or REST client for Tavily Search API).

### Edge Hardware / Simulation Bridge

* **Hardware Target:** Microcontroller rig (Arduino / ESP32 / STM32) with motor/actuator, accelerometer/IMU (vibration FFT), and voltage/current sensing—plus a software **Synthetic Fault Injector** fallback mode so judges can test the live hosted web demo without needing the physical rig connected to their browser.
* **Bridge Daemon:** Node.js / Python serial-to-WebSocket bridge (`scripts/edge-bridge.ts`) that reads serial JSON packets from the MCU and bi-directionally syncs commands from the Next.js server.

### Required Environment Variables (`.env.local`)

```env
# Nebius Token Factory (OpenAI-Compatible)
NEBIUS_API_KEY="your_nebius_token_factory_key"
NEBIUS_BASE_URL="https://api.tokenfactory.nebius.com/v1"

# Nebius Serverless Jobs / Cloud API (for async policy verification)
NEBIUS_PROJECT_ID="your_nebius_project_id"

# Tavily Search API (for $3,000 Sponsor Prize eligibility)
TAVILY_API_KEY="tvly-your_api_key"

# Supabase (Telemetry & Agent Audit Logs)
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_anon_key"

```

---

## 4. Directory Structure Specification for Antigravity

Please scaffold and maintain the project using this modular layout:

```text
├── hardware/
│   ├── firmware/                  # C++ MCU sketch (FFT calculation, ADC sampling, serial command listener)
│   └── edge-bridge/               # Local Serial <-> WebSocket bridge + Synthetic Telemetry Generator
├── jobs/
│   └── policy-verifier/           # Python script/Dockerfile for Nebius Serverless Job simulation check
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── telemetry/route.ts # Ingests edge frames & triggers Tier-1 Nano triage
│   │   │   ├── diagnose/route.ts  # Runs Tier-2 Tavily lookup + Nemotron Ultra root-cause & actuation
│   │   │   └── simulate/route.ts  # Triggers Nebius Serverless Job / Digital Twin verification
│   │   ├── page.tsx               # Main Physical AI Command Center UI
│   │   └── layout.tsx
│   ├── components/
│   │   ├── WaveformMonitor.tsx    # Real-time time-domain & FFT frequency bin visualizer
│   │   ├── AgentTracePanel.tsx    # Live view of Nano -> Tavily -> Ultra reasoning steps & latency
│   │   ├── HardwareControlRig.tsx # Manual fault injection toggles & live actuator state indicators
│   │   └── FinOpsMetricsBar.tsx   # Displays latency & token cost savings from multi-model routing
│   └── lib/
│       ├── nebius.ts              # OpenAI client wrapper + model tier constants
│       ├── tavily.ts              # Datasheet & component specification retrieval helper
│       └── types.ts               # Shared TypeScript interfaces for TelemetryFrame, AgentDecision, ActuationCommand
├── LICENSE                        # MIT License (Mandatory for Devpost compliance)
└── README.md                      # Architecture-first documentation for judges

```

---

## 5. Core Implementation Contracts

### A. Telemetry Payload Contract (`src/lib/types.ts`)

```typescript
export interface TelemetryFrame {
  timestamp: number;
  deviceId: string;
  mode: 'HARDWARE_LIVE' | 'SYNTHETIC_TWIN';
  metrics: {
    supplyVoltageV: number;        // e.g., 12.1V nominal, drops or transient spikes
    currentDrawMa: number;
    temperatureC: number;
    pwmDutyCycle: number;          // 0 - 255
    fftDominantFreqHz: number;     // Peak harmonic from onboard FFT
    fftPeakMagnitude: number;
    fftBins: number[];             // 16 or 32 normalized frequency bins for UI spectrum chart
  };
}

export interface ActuationCommand {
  commandId: string;
  targetDeviceId: string;
  action: 'SET_PWM' | 'RECALIBRATE_PID' | 'ENGAGE_CURRENT_LIMIT' | 'EMERGENCY_CUTOFF';
  parameters: {
    targetPwm?: number;
    kp?: number;
    ki?: number;
    kd?: number;
    reason: string;
  };
  verifiedBySimulation: boolean;
  modelChainUsed: string[];
}

```

### B. Multi-Model Nebius Router (`src/lib/nebius.ts`)

* **Tier 1 (Fast Triage):** Use `nvidia/Nemotron-3_5-Lightning` (or `nvidia/Llama-3_1-Nemotron-Nano-8B-v1` / `Nemotron-3-Nano-30B` depending on exact Token Factory model slug availability). Keep `max_tokens: 150` and `temperature: 0.1` for deterministic JSON anomaly classification.
* **Tier 2 (Deep Reasoning & Policy Synthesis):** Use `nvidia/Nemotron-3-Ultra-550b-a55b` (or `nvidia/nemotron-3-super-120b-a12b`). Feed it the anomalous `TelemetryFrame`, historical baseline, and the raw markdown snippets returned by the **Tavily Search API** for the specific motor/MOSFET/regulator part numbers.

---

## 6. Step-by-Step Build Execution Plan for Antigravity

Execute the build in the following sequence so we always have a working, testable artifact:

1. **Phase 1: Repository & Core Scaffolding (Day 1)**
* Initialize the Next.js TypeScript project with Tailwind CSS and add the root `MIT` `LICENSE` file immediately.
* Implement `src/lib/nebius.ts` and verify connectivity to `[https://api.tokenfactory.nebius.com/v1/models](https://api.tokenfactory.nebius.com/v1/models)` to confirm exact model IDs available on the account.
* Implement `src/lib/tavily.ts` to query hardware component datasheets (e.g., querying thermal derating and voltage transient specs for specific MOSFETs, DACs, or motor drivers).


2. **Phase 2: Digital Twin & Real-Time Telemetry UI (Days 2–3)**
* Build the `WaveformMonitor` and `HardwareControlRig` components in Next.js.
* Create a client/server **Synthetic Fault Generator** (simulating bearing wear via secondary FFT harmonic spikes, under-voltage brownouts, and thermal runaway) so the web app works out-of-the-box for hackathon judges via a public URL.


3. **Phase 3: Tiered Agent Pipeline & Serverless Verification (Days 4–6)**
* Wire up `/api/telemetry` (Nemotron Nano fast triage) and `/api/diagnose` (Tavily datasheet lookup + Nemotron Ultra recovery synthesis).
* Build the `AgentTracePanel` to visually highlight multi-model routing (showing Nano handling 95% of nominal frames cheaply and escalating only anomalies to Ultra) and display live latency/cost metrics.
* Package the Python verification script in `jobs/policy-verifier/` to run on **Nebius Serverless Jobs** (with a fast local fallback so the UI never hangs during live demos).


4. **Phase 4: Physical Edge Hardware Integration (Days 7–10)**
* Flash the C++ firmware (`hardware/firmware/`) onto the microcontroller rig to compute real-time FFT / sensor readings and accept serial JSON actuation commands (`SET_PWM`, `EMERGENCY_CUTOFF`).
* Connect the rig via `hardware/edge-bridge/` to the Next.js dashboard and record the mandatory **1-minute continuous physical hardware operation clip** showing a real physical fault being induced, detected by Nano, diagnosed with Tavily + Ultra, and automatically stabilized on the rig.