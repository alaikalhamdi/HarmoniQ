'use client';

import React from 'react';
import { Sliders, Wrench, ShieldAlert, RotateCcw, Power } from 'lucide-react';
import { ActuationCommand, FaultMode, OperatingMode } from '@/lib/types';

interface HardwareControlRigProps {
  mode: OperatingMode;
  activeFault: FaultMode;
  targetPwm: number;
  pidGains: { kp: number; ki: number; kd: number };
  currentLimitMa: number;
  isEmergencyStopped: boolean;
  lastCommand: ActuationCommand | null;
  onSetMode: (mode: OperatingMode) => void;
  onInjectFault: (fault: FaultMode) => void;
  onResetFault: () => void;
  onManualPwmChange: (pwm: number) => void;
  onEmergencyStop: () => void;
}

export const HardwareControlRig: React.FC<HardwareControlRigProps> = ({
  mode,
  activeFault,
  targetPwm,
  pidGains,
  currentLimitMa,
  isEmergencyStopped,
  lastCommand,
  onSetMode,
  onInjectFault,
  onResetFault,
  onManualPwmChange,
  onEmergencyStop,
}) => {
  return (
    <div className="bg-[#111827] border border-[#1F2937] rounded-sm p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F2937] pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F9FAFB]">
            Hardware Control Deck and Fault Injector
          </h2>
        </div>

        {/* Operating Rig Mode Toggle */}
        <div className="flex items-center gap-1 bg-[#0B0F17] p-1 rounded border border-[#1F2937] text-xs font-mono">
          <button
            type="button"
            onClick={() => onSetMode('SYNTHETIC_TWIN')}
            className={`min-h-[36px] px-3 py-1 rounded transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2 ${
              mode === 'SYNTHETIC_TWIN'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            DIGITAL TWIN
          </button>
          <button
            type="button"
            onClick={() => onSetMode('HARDWARE_LIVE')}
            className={`min-h-[36px] px-3 py-1 rounded transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2 ${
              mode === 'HARDWARE_LIVE'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            PHYSICAL RIG
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        {/* Fault Injection Panel */}
        <div className="lg:col-span-5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-300">
            <span className="flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span>SYNTHETIC FAULT INJECTOR (DEVPOST DEMO)</span>
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${
                activeFault !== 'NONE'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              ACTIVE: {activeFault}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onInjectFault('BEARING_WEAR')}
              className={`min-h-[44px] p-2.5 rounded border text-left flex flex-col gap-1 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2 ${
                activeFault === 'BEARING_WEAR'
                  ? 'bg-rose-500/20 border-rose-500 text-rose-200'
                  : 'bg-[#0B0F17] border-[#1F2937] text-gray-200 hover:border-gray-500'
              }`}
            >
              <span className="text-[11px] font-bold">1. Bearing Wear</span>
              <span className="text-[10px] font-mono text-gray-400">
                Spike 385Hz FFT harmonic &gt;0.85g
              </span>
            </button>

            <button
              type="button"
              onClick={() => onInjectFault('VOLTAGE_BROWNOUT')}
              className={`min-h-[44px] p-2.5 rounded border text-left flex flex-col gap-1 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2 ${
                activeFault === 'VOLTAGE_BROWNOUT'
                  ? 'bg-rose-500/20 border-rose-500 text-rose-200'
                  : 'bg-[#0B0F17] border-[#1F2937] text-gray-200 hover:border-gray-500'
              }`}
            >
              <span className="text-[11px] font-bold">2. Brownout</span>
              <span className="text-[10px] font-mono text-gray-400">
                Drop rail to 8.3V with current surge
              </span>
            </button>

            <button
              type="button"
              onClick={() => onInjectFault('THERMAL_RUNAWAY')}
              className={`min-h-[44px] p-2.5 rounded border text-left flex flex-col gap-1 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2 ${
                activeFault === 'THERMAL_RUNAWAY'
                  ? 'bg-rose-500/20 border-rose-500 text-rose-200'
                  : 'bg-[#0B0F17] border-[#1F2937] text-gray-200 hover:border-gray-500'
              }`}
            >
              <span className="text-[11px] font-bold">3. Thermal Runaway</span>
              <span className="text-[10px] font-mono text-gray-400">
                Ramp MOSFET temp &gt;105°C SOA
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onResetFault}
            className="w-full min-h-[44px] py-2 px-3 rounded border border-[#1F2937] bg-[#0B0F17] text-xs font-mono text-gray-200 hover:bg-[#1F2937] hover:text-white flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET RIG TO NOMINAL BASELINE</span>
          </button>
        </div>

        {/* Live Actuator Telemetry & Manual Override */}
        <div className="lg:col-span-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-300 tabular-nums">
            <label htmlFor="pwm-duty-slider">ACTUATOR STATE &amp; MANUAL OVERRIDE</label>
            <span className="text-gray-200 font-bold">PWM: {targetPwm} / 255</span>
          </div>

          <div className="bg-[#0B0F17] border border-[#1F2937] rounded p-3 flex flex-col gap-2 tabular-nums">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-gray-400">Duty Cycle:</span>
              <span className="text-emerald-400 font-bold">
                {Math.round((targetPwm / 255) * 100)}%
              </span>
            </div>
            <input
              id="pwm-duty-slider"
              type="range"
              min="0"
              max="255"
              value={targetPwm}
              disabled={isEmergencyStopped}
              onChange={(e) => onManualPwmChange(Number(e.target.value))}
              aria-label="PWM Duty Cycle Override"
              className="w-full accent-emerald-500 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
            />

            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono border-t border-[#1F2937] text-gray-400">
              <div>
                <span>PID Tuning:</span>
                <span className="block text-gray-200">
                  P:{pidGains.kp.toFixed(2)} I:{pidGains.ki.toFixed(2)} D:{pidGains.kd.toFixed(2)}
                </span>
              </div>
              <div>
                <span>Current Limit:</span>
                <span className="block text-amber-400 font-bold">{currentLimitMa} mA</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onEmergencyStop}
            className={`w-full min-h-[44px] py-2 px-3 rounded text-xs font-mono font-bold flex items-center justify-center gap-2 border transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2 ${
              isEmergencyStopped
                ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/40 hover:bg-rose-500/20'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>
              {isEmergencyStopped ? 'RIG CUTOFF ENGAGED (CLICK TO UNLATCH)' : 'EMERGENCY CUTOFF'}
            </span>
          </button>
        </div>

        {/* Closed-Loop Actuation Dispatch Card */}
        <div className="lg:col-span-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-gray-300">
            <span>LAST VERIFIED ACTUATION</span>
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
          </div>

          <div className="bg-[#0B0F17] border border-[#1F2937] rounded p-3 text-xs font-mono flex flex-col justify-between h-full">
            {lastCommand ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold">{lastCommand.action}</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                    SIM VERIFIED
                  </span>
                </div>
                <p className="text-[11px] text-gray-200 leading-tight">
                  {lastCommand.parameters.reason}
                </p>
                <div className="border-t border-[#1F2937] pt-1.5 text-[10px] text-gray-400 flex flex-col gap-0.5">
                  <span>Target: {lastCommand.targetDeviceId}</span>
                  <span>Chain: {lastCommand.modelChainUsed.join(' -> ')}</span>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-[11px] text-center">
                System nominal. No corrective actuation required.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
