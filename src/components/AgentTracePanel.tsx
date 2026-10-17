'use client';

import React from 'react';
import { Terminal, ExternalLink, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { AgentTraceEvent, TavilyDatasheetCitation } from '@/lib/types';

interface AgentTracePanelProps {
  traces: AgentTraceEvent[];
  latestCitations: TavilyDatasheetCitation[];
}

export const AgentTracePanel: React.FC<AgentTracePanelProps> = ({
  traces,
  latestCitations,
}) => {
  const getStageBadge = (stage: AgentTraceEvent['stage']) => {
    switch (stage) {
      case 'TRIAGE_NANO':
        return { label: '1. NANO TRIAGE', color: 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10' };
      case 'DATASHEET_TAVILY':
        return { label: '2. TAVILY GROUNDING', color: 'border-amber-500/40 text-amber-300 bg-amber-500/10' };
      case 'POLICY_ULTRA':
        return { label: '3. ULTRA SYNTHESIS', color: 'border-purple-500/40 text-purple-300 bg-purple-500/10' };
      case 'SIMULATION_VERIFY':
        return { label: '4. SANDBOX VERIFY', color: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' };
      case 'ACTUATION_DISPATCH':
        return { label: '5. RIG DISPATCH', color: 'border-blue-500/40 text-blue-300 bg-blue-500/10' };
    }
  };

  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-sm p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F2937] pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-purple-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F9FAFB]">
            Autonomous Agent Reasoning &amp; Datasheet Grounding Trace
          </h2>
        </div>
        <span className="text-[11px] font-mono text-gray-400">
          CLOSED-LOOP PIPELINE: Nano → Tavily Search → Ultra → Sandbox → Rig
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Live Agent Trace Feed */}
        <div className="lg:col-span-8 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-1">
            <span>MULTI-TIER REASONING LOG ({traces.length} EVENTS)</span>
            <span className="text-gray-500">Auto-streaming</span>
          </div>

          <div className="border border-[#1F2937] rounded bg-[#0B0F17] p-3 max-h-[340px] overflow-y-auto flex flex-col gap-2.5 font-mono text-xs">
            {traces.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-xs">
                Waiting for telemetry frames to trigger triage evaluation...
              </div>
            ) : (
              traces.map((trace) => {
                const badge = getStageBadge(trace.stage);
                const timeString = new Date(trace.timestamp).toLocaleTimeString();

                return (
                  <div
                    key={trace.id}
                    className="p-2.5 rounded bg-[#111827] border border-[#1F2937] flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                        {trace.status === 'SUCCESS' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span className="text-[11px] text-gray-400">{timeString}</span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Clock className="w-3 h-3" />
                        <span>{trace.latencyMs} ms</span>
                      </div>
                    </div>

                    <p className="text-gray-200 text-[11px] leading-relaxed">
                      {trace.description}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Tavily Datasheet Grounding Citations */}
        <div className="lg:col-span-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-1">
            <span className="text-amber-400 font-bold">
              TAVILY DATASHEET GROUNDING ($3,000 PRIZE)
            </span>
          </div>

          <div className="border border-[#1F2937] rounded bg-[#0B0F17] p-3 max-h-[340px] overflow-y-auto flex flex-col gap-2.5">
            {latestCitations.length === 0 ? (
              <div className="p-6 text-center text-gray-500 font-mono text-xs">
                Inject a fault to trigger live manufacturer datasheet grounding via Tavily Search API.
              </div>
            ) : (
              latestCitations.map((citation, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-[#111827] border border-[#1F2937] flex flex-col gap-1.5 text-xs font-mono"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-emerald-400 font-bold text-[11px]">
                      {citation.component}
                    </span>
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[10px]"
                    >
                      <span>Datasheet</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <p className="text-gray-300 text-[11px] font-sans font-medium line-clamp-1">
                    {citation.title}
                  </p>

                  <p className="text-gray-400 text-[10px] leading-relaxed bg-[#0B0F17] p-2 rounded border border-[#1F2937]">
                    &quot;{citation.snippet}&quot;
                  </p>

                  {citation.limits.safeOperatingArea && (
                    <div className="text-[10px] text-amber-300 border-t border-[#1F2937] pt-1">
                      SOA Limit: {citation.limits.safeOperatingArea}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
