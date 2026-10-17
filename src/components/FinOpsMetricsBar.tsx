'use client';

import React from 'react';
import { Cpu, DollarSign, Activity, Zap, Play, Pause } from 'lucide-react';
import { FaultMode, FinOpsStats } from '@/lib/types';

interface FinOpsMetricsBarProps {
  finops: FinOpsStats;
  activeFault: FaultMode;
  isStreaming: boolean;
  onToggleStream: () => void;
}

export const FinOpsMetricsBar: React.FC<FinOpsMetricsBarProps> = ({
  finops,
  activeFault,
  isStreaming,
  onToggleStream,
}) => {
  const isLiveInference = finops.inferenceSource === 'NEBIUS_LIVE';

  return (
    <header className="w-full bg-[#111827] border-b border-[#1F2937] px-4 py-3 select-none">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Subsystem Title */}
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-8 bg-emerald-500 rounded-sm" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-wider text-[#F9FAFB] uppercase">
                Physical AI Command Center
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#1F2937] text-gray-400 bg-[#0B0F17]">
                v1.0-RC
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono">
              Edge-to-Cloud Predictive Maintenance and Closed-Loop Recovery
            </p>
          </div>
        </div>

        {/* Live Metrics Instrumentation */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          {/* Active Model Tier Routing */}
          <div className="flex items-center gap-2 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-[#1F2937]">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase">Routing</span>
              <span className="text-gray-200">
                Nano <span className="text-gray-500">({finops.tier1Calls})</span> / Ultra{' '}
                <span className="text-gray-500">({finops.tier2Calls})</span>
              </span>
            </div>
          </div>

          {/* Sub-150ms Triage Latency */}
          <div className="flex items-center gap-2 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-[#1F2937]">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase">Triage P95</span>
              <span className="text-gray-200">{finops.averageTriageLatencyMs} ms</span>
            </div>
          </div>

          {/* Nominal Frames Filtered Ratio */}
          <div className="flex items-center gap-2 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-[#1F2937]">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase">Nano Filtered</span>
              <span className="text-emerald-400">{finops.filteredNominalPercent}%</span>
            </div>
          </div>

          {/* FinOps Cost Savings USD */}
          <div className="flex items-center gap-2 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-[#1F2937]">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase">Token Cost Saved</span>
              <span className="text-emerald-400 font-bold">
                ${finops.estimatedCostSavingsUsd.toFixed(4)}
              </span>
            </div>
          </div>

          {/* Backend Status Badge */}
          <div className="flex items-center gap-1.5 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-[#1F2937]">
            <span
              className={`w-2 h-2 rounded-full ${
                isLiveInference ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'
              }`}
            />
            <span className="text-[11px] text-gray-300">
              {isLiveInference ? 'NEBIUS LIVE' : 'LOCAL SIM'}
            </span>
          </div>

          {/* Telemetry Stream Toggle */}
          <button
            onClick={onToggleStream}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
              isStreaming
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
            }`}
            aria-label={isStreaming ? 'Pause Telemetry' : 'Resume Telemetry'}
          >
            {isStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>RESUME</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
