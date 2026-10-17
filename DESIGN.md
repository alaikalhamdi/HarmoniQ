# Design Direction: Industrial Oscilloscope Telemetry & Command Center

## 1. Visual Identity & Mood
The application is a mission-critical edge-to-cloud telemetry and fault recovery console. It follows an industrial instrumentation aesthetic reminiscent of modern digital storage oscilloscopes, laboratory spectrum analyzers, and aerospace flight test telemetry consoles.

- Identity: Precise, technical, mission-critical, deterministic.
- Personality: Utilitarian instrumentation. Every element serves an operational purpose.
- Mood: High contrast, dark environment engineered to minimize eye strain during live hardware monitoring.

## 2. Antislop Dials
- ENERGY: 2 (Controlled, technical precision with active telemetry readouts)
- RHYTHM: 2 (Consistent instrumentation grid with modular diagnostic modules)
- MOTION: 2 (High-frequency data streaming animations on waveforms, stable UI shells)

## 3. Color System
- Surface Canvas: `#0B0F17` (Deep carbon obsidian)
- Instrument Panels: `#111827` (Dark instrument slate)
- Panel Borders: `#1F2937` (1px crisp structural divider)
- Typography:
  - Primary Text: `#F9FAFB` (High contrast, WCAG AA compliant)
  - Secondary Text: `#9CA3AF` (Engineering metadata)
  - Dim Text: `#6B7280` (Units, inactive indicators)
- Semantic Status Tokens:
  - NOMINAL: `#10B981` (Emerald green, stable operating zone)
  - WARNING: `#F59E0B` (Amber, transient spike or thermal derating threshold)
  - FAULT: `#EF4444` (Crimson, structural vibration anomaly or brownout)
  - TELEMETRY TRACE: `#06B6D4` (High-visibility cyan for time-domain signals)

## 4. Typography & Numerical Representation
- Sans-serif typography for structural titles and controls.
- Monospace font (`font-mono`) with tabular numerical alignment (`tabular-nums`) for all engineering values: voltages, currents, temperatures, FFT harmonic frequencies, and timestamps.
- Zero decorative cursive or playful novelty typefaces.

## 5. Functional & Craftsmanship Requirements
- Zero dead controls: every switch, injection button, manual override, and reset trigger updates the physical twin or hardware rig state.
- Zero generic AI slop: no purple-to-blue glow gradients, no stacked blur effects, no em dash characters, and no fabricated social proof.
- Complete state coverage: each telemetry and trace card handles Empty (waiting for device), Loading/Connecting, Nominal stream, and Fault alarm states.
- High accessibility: keyboard navigable with visible focus rings and WCAG AA contrast ratios across all panels.
