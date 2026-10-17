'use client';

import React, { useEffect, useRef } from 'react';
import { Activity, Radio, AlertTriangle } from 'lucide-react';
import { TelemetryFrame, TriageStatus } from '@/lib/types';

interface WaveformMonitorProps {
  currentFrame: TelemetryFrame | null;
  history: TelemetryFrame[];
  status: TriageStatus;
  isLoading: boolean;
}

export const WaveformMonitor: React.FC<WaveformMonitorProps> = ({
  currentFrame,
  history,
  status,
  isLoading,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // High performance Canvas time-domain oscilloscope renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#0B0F17';
    ctx.fillRect(0, 0, width, height);

    // Draw Oscilloscope Grid Lines
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 1;

    // Vertical grid divisions (time)
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal grid divisions (voltage/current/temp)
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Reference safe operating threshold lines
    // Voltage 10V min line
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.setLineDash([4, 4]);
    const vRefY = height - (10.0 / 16.0) * height;
    ctx.beginPath();
    ctx.moveTo(0, vRefY);
    ctx.lineTo(width, vRefY);
    ctx.stroke();

    // Temp 85C max line
    const tRefY = height - (85.0 / 130.0) * height;
    ctx.beginPath();
    ctx.moveTo(0, tRefY);
    ctx.lineTo(width, tRefY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (history.length < 2) {
      return;
    }

    const maxPoints = 80;
    const recent = history.slice(-maxPoints);
    const stepX = width / (maxPoints - 1);

    // Plot Voltage Trace (Cyan, scale 0V - 16V)
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    recent.forEach((f, idx) => {
      const v = Math.max(0, Math.min(16, f.metrics.supplyVoltageV));
      const y = height - (v / 16.0) * height;
      const x = idx * stepX;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Plot Temperature Trace (Coral, scale 20C - 130C)
    ctx.strokeStyle = '#F43F5E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    recent.forEach((f, idx) => {
      const t = Math.max(20, Math.min(130, f.metrics.temperatureC));
      const y = height - ((t - 20) / 110.0) * height;
      const x = idx * stepX;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Plot Current Draw (Amber, scale 0mA - 2000mA)
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    recent.forEach((f, idx) => {
      const c = Math.max(0, Math.min(2000, f.metrics.currentDrawMa));
      const y = height - (c / 2000.0) * height;
      const x = idx * stepX;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [history]);

  const metrics = currentFrame?.metrics;
  const fftBins = metrics?.fftBins || new Array(16).fill(0);

  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-sm p-4 flex flex-col gap-4">
      {/* Instrumentation Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F2937] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F9FAFB]">
            Dual-Channel Waveform and Harmonic Spectrum
          </h2>
        </div>

        {/* Readout Values */}
        {metrics ? (
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-cyan-400">
              V: <strong className="text-white">{metrics.supplyVoltageV.toFixed(2)}</strong> V
            </span>
            <span className="text-amber-400">
              I: <strong className="text-white">{metrics.currentDrawMa.toFixed(0)}</strong> mA
            </span>
            <span className="text-rose-400">
              T: <strong className="text-white">{metrics.temperatureC.toFixed(1)}</strong> °C
            </span>
            <span className="text-emerald-400">
              PWM: <strong className="text-white">{metrics.pwmDutyCycle}</strong>
            </span>
            <span className="text-gray-300">
              FFT: <strong className="text-white">{metrics.fftDominantFreqHz}</strong> Hz (
              {metrics.fftPeakMagnitude.toFixed(2)}g)
            </span>
          </div>
        ) : (
          <span className="text-xs font-mono text-gray-500">Waiting for telemetry frame...</span>
        )}
      </div>

      {/* Dual Display Canvas & Spectrum Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: 30Hz Time-Domain Oscilloscope */}
        <div className="lg:col-span-8 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-1">
            <span>TIME-DOMAIN TELEMETRY (30Hz)</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-0.5 bg-cyan-400 inline-block" /> Voltage (0-16V)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-0.5 bg-amber-400 inline-block" /> Current (0-2A)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-0.5 bg-rose-400 inline-block" /> Temp (20-130°C)
              </span>
            </div>
          </div>

          <div className="relative border border-[#1F2937] rounded bg-[#0B0F17] overflow-hidden">
            <canvas
              ref={canvasRef}
              width={640}
              height={220}
              className="w-full h-[220px] block"
            />
            {isLoading && (
              <div className="absolute inset-0 bg-[#0B0F17]/80 flex items-center justify-center">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                  <Radio className="w-4 h-4 animate-spin" />
                  <span>SYNCHRONIZING SENSOR ADC...</span>
                </div>
              </div>
            )}
            {!metrics && !isLoading && (
              <div className="absolute inset-0 bg-[#0B0F17]/90 flex items-center justify-center">
                <p className="text-xs font-mono text-gray-500">NO ACTIVE TELEMETRY STREAM</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: 16-Bin FFT Frequency Spectrum Analyzer */}
        <div className="lg:col-span-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-1">
            <span>FFT HARMONIC BINS (0-512Hz)</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                status === 'FAULT'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : status === 'WARNING'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {status}
            </span>
          </div>

          <div className="border border-[#1F2937] rounded bg-[#0B0F17] p-2.5 h-[220px] flex flex-col justify-end">
            <div className="w-full h-full flex items-end justify-between gap-1 pt-4 pb-1">
              {fftBins.map((binVal, idx) => {
                const freqHz = idx * 32;
                const isAnomalous = binVal >= 0.55;
                const isDominant =
                  metrics && Math.abs(metrics.fftDominantFreqHz - freqHz) < 24;

                const barHeightPercent = Math.min(100, Math.max(6, binVal * 100));

                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center h-full justify-end group relative"
                  >
                    <div
                      style={{ height: `${barHeightPercent}%` }}
                      className={`w-full rounded-t-xs transition-all duration-75 ${
                        isAnomalous
                          ? 'bg-rose-500'
                          : isDominant
                          ? 'bg-cyan-400'
                          : 'bg-emerald-500/70 hover:bg-emerald-400'
                      }`}
                    />
                    <span className="text-[9px] font-mono text-gray-500 mt-1">
                      {idx % 2 === 0 ? freqHz : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Threshold Reference Indicator */}
            <div className="border-t border-[#1F2937] pt-1.5 flex items-center justify-between text-[10px] font-mono text-gray-400">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>Harms &gt; 0.55g: Race defect</span>
              </span>
              <span>16 Bins @ 32Hz</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
