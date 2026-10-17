<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HarmoniQ — Agent Instructions

Closed-loop Physical AI fault-recovery agent (Nebius x NVIDIA hackathon, Physical AI track). A Next.js 16 command center ingests edge telemetry, routes it through a tiered Nemotron pipeline on Nebius Token Factory, grounds diagnoses in manufacturer datasheets via Tavily, verifies the candidate actuation in a state-space sandbox, then dispatches it back to the rig.

This file is the single source of agent instructions for this repo. Do not add other agent-instruction files (a legacy `GEMINI.md` was removed to prevent drift).

## Commands

```bash
npm run dev              # Next.js dev server (also regenerates the Next.js block above)
npm run build            # production build (Turbopack)
npm run lint             # eslint
npm run smoke-test       # end-to-end closed-loop lifecycle test (tsx, no server needed)
npm run verify:job       # python self-test for the policy verifier container
npm run bridge:synthetic # 30Hz synthetic telemetry streamer -> /api/telemetry
```

Always run `npm run lint` and `npm run smoke-test` after changing `src/lib/**` or API routes. `npm run build` is the reliable typecheck gate (`tsc --noEmit` alone does not run Next's route type generation).

## Architecture map

| Layer | Files |
|---|---|
| UI (client) | `src/app/page.tsx` orchestrates the loop; `src/components/{WaveformMonitor,HardwareControlRig,AgentTracePanel,FinOpsMetricsBar}.tsx` |
| Physics / demo truth | `src/lib/digital-twin.ts` — 30Hz discrete simulation, fault injection, closed-loop convergence |
| Agent pipeline | `src/lib/nebius.ts` (two-tier router + LLM output validation), `src/lib/tavily.ts` (datasheet grounding) |
| Verifier | `src/lib/verifier-job.ts` (backend dispatcher), `src/lib/simulator.ts` (in-process TS engine), `jobs/policy-verifier/verifier.py` (container entrypoint) |
| API | `src/app/api/telemetry/route.ts` (Tier-1 triage), `diagnose/route.ts` (Tavily + Tier-2), `simulate/route.ts` (verify + dispatch) |
| State | `src/lib/store.ts` — in-memory ring buffers, optional Supabase audit logging |
| Edge | `hardware/firmware/esp32_telemetry_rig.ino`, `hardware/edge-bridge/bridge.ts` |
| Types | `src/lib/types.ts` — all shared contracts live here; extend these first |

## Environment

Copy `.env.example` to `.env.local`. Every integration has a deterministic fallback, so the app runs zero-config:

- Nebius Token Factory: `NEBIUS_API_KEY`, `NEBIUS_BASE_URL`, optional `NEBIUS_TIER1_MODEL` / `NEBIUS_TIER2_MODEL` (else auto-discovered via `/v1/models`).
- Tavily: `TAVILY_API_KEY` (falls back to curated datasheet specs).
- Supabase: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional audit logging).
- Remote policy verifier (optional): `NEBIUS_VERIFIER_REMOTE=true` plus `NEBIUS_PROJECT_ID`, `NEBIUS_IAM_TOKEN`, `NEBIUS_JOB_IMAGE`, `NEBIUS_JOB_PLATFORM`, `NEBIUS_JOB_PRESET`, and optional `NEBIUS_JOB_SUBNET_ID` / `NEBIUS_JOB_POLL_BUDGET_MS` / `NEBIUS_JOB_POLL_INTERVAL_MS`.

## Verifier backends

`verifyPolicyWithDispatch()` in `src/lib/verifier-job.ts` resolves the strongest available backend and reports which one actually ran via `SimulationResult.verifierBackend`:

1. `NEBIUS_SERVERLESS_JOB` — real dispatch to `https://api.nebius.cloud/ai/v1/jobs` (opt-in, bounded poll); the container's non-zero exit on unsafe policies makes the job's terminal state the pass/fail gate.
2. `LOCAL_CONTAINER` — spawns `jobs/policy-verifier/verifier.py` as a subprocess (default when Python is on PATH).
3. `LOCAL_STATE_SPACE` — the in-process TypeScript engine (last resort).

Keep the Python and TypeScript engines mathematically identical; `smoke_test.ts` and `verifier.py --self-test` both assert the same boundaries. Never label a result with a backend that did not run.

## Conventions & gotchas

- **Untrusted model output:** all LLM JSON is validated in `src/lib/nebius.ts` (enum/number/string guardrails, numeric clamps) before it reaches `ActuationCommand`. Extend the validators when you add response fields; never index parsed JSON directly.
- **Zero-config first:** any new external call must have a deterministic fallback so judges can run the demo without keys or hardware.
- **Demo truth is `digital-twin.ts`,** not the firmware. The ESP32 sketch is a real-hardware target and its `computeFFT16` is a magnitude shift register, not a true FFT; do not describe it as a hardware FFT.
- **Metrics must be honest:** e.g. `averageTriageLatencyMs` is a running mean (see `store.recordTriageLatency`); the UI must label it accordingly.
- **Docs:** keep `README.md` in sync with behavior. Do not reintroduce a second agent-instruction file.
- **Design:** follow `DESIGN.md` — dark instrumentation aesthetic, monospace tabular numerics, no purple-to-blue gradients or blur stacks.
