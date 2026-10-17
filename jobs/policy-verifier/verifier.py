#!/usr/bin/env python3
"""
Nebius Serverless Job: Policy & Control-Loop Stability Verifier
Validates candidate ActuationCommands against state-space physics models
before hardware dispatch to prevent physical rig damage.
"""

import sys
import json
import argparse
import math

def simulate_policy_forward(frame_metrics, command):
    """
    Executes a 50-step forward discrete-time state-space simulation (2.5s horizon)
    to predict thermal, electrical, and vibration stability.
    """
    sim_temp = float(frame_metrics.get('temperatureC', 45.0))
    sim_current = float(frame_metrics.get('currentDrawMa', 450.0))
    sim_vibration = float(frame_metrics.get('fftPeakMagnitude', 0.25))
    sim_pwm = float(frame_metrics.get('pwmDutyCycle', 200))

    action = command.get('action', 'SET_PWM')
    params = command.get('parameters', {})

    if action == 'EMERGENCY_CUTOFF':
        target_pwm = 0.0
    elif 'targetPwm' in params and params['targetPwm'] is not None:
        target_pwm = float(params['targetPwm'])
    else:
        target_pwm = sim_pwm * 0.6

    if 'currentLimitMa' in params and params['currentLimitMa'] is not None:
        current_limit = float(params['currentLimitMa'])
    elif action == 'ENGAGE_CURRENT_LIMIT':
        current_limit = 650.0
    else:
        current_limit = 2000.0

    kd = float(params.get('kd', 0.15)) if action == 'RECALIBRATE_PID' else 0.15
    damping_factor = min(2.0, max(0.5, kd * 6.0))

    steps = 50
    ambient_temp = 30.0

    for _ in range(steps):
        # PWM tracking with physical rotor inertia
        sim_pwm += (target_pwm - sim_pwm) * 0.15

        # Steady state physics targets with Joule heating
        joule_heat = math.pow(sim_pwm / 255.0, 1.8) * 65.0 + (sim_current / 1000.0) * 15.0
        target_temp_steady = ambient_temp + joule_heat
        target_current_steady = 75.0 + (sim_pwm / 255.0) * 650.0
        target_vibration_steady = (0.05 + (sim_pwm / 255.0) * 0.22) / damping_factor

        # Discrete-time transitions
        sim_temp += (target_temp_steady - sim_temp) * 0.04
        sim_current += (target_current_steady - sim_current) * 0.2
        sim_vibration += (target_vibration_steady - sim_vibration) * 0.18

        # Current clamp
        if sim_current > current_limit:
            sim_current = current_limit

    # Hard boundary checks per Vishay IRF540N & TI DRV8833 datasheets
    max_safe_temp = 85.0
    max_safe_current = 1200.0
    max_safe_vibration = 0.40

    is_temp_safe = sim_temp <= max_safe_temp
    is_current_safe = sim_current <= max_safe_current
    is_vibration_safe = sim_vibration <= max_safe_vibration

    verified = is_temp_safe and is_current_safe and is_vibration_safe

    temp_margin = max(0.0, (max_safe_temp - sim_temp) / max_safe_temp)
    curr_margin = max(0.0, (max_safe_current - sim_current) / max_safe_current)
    vib_margin = max(0.0, (max_safe_vibration - sim_vibration) / max_safe_vibration)
    safety_margin_pct = int(min(temp_margin, curr_margin, vib_margin) * 100)

    return {
        "verified": verified,
        "predictedTempC": round(sim_temp, 1),
        "predictedVibrationG": round(sim_vibration, 3),
        "predictedCurrentMa": round(sim_current, 1),
        "safetyMarginPercent": safety_margin_pct,
        "verifierBackend": "NEBIUS_SERVERLESS_JOB"
    }

def run_self_test():
    print("=== Nebius Serverless Job: Verifier Self-Test ===")
    
    # Test 1: Thermal Runaway Derating Verification
    test_metrics = {
        "temperatureC": 108.5,
        "currentDrawMa": 820.0,
        "fftPeakMagnitude": 0.28,
        "pwmDutyCycle": 220
    }
    safe_command = {
        "action": "SET_PWM",
        "parameters": {"targetPwm": 85, "reason": "Derate to restore SOA"}
    }
    unsafe_command = {
        "action": "SET_PWM",
        "parameters": {"targetPwm": 255, "reason": "Dangerous full power command"}
    }

    result_safe = simulate_policy_forward(test_metrics, safe_command)
    print(f"[TEST 1] Safe Derating (PWM 85): Verified={result_safe['verified']} (Pred Temp: {result_safe['predictedTempC']}C, Margin: {result_safe['safetyMarginPercent']}%)")
    assert result_safe['verified'] is True, "Safe command should pass verification"

    result_unsafe = simulate_policy_forward(test_metrics, unsafe_command)
    print(f"[TEST 2] Dangerous Command (PWM 255): Verified={result_unsafe['verified']} (Pred Temp: {result_unsafe['predictedTempC']}C)")
    assert result_unsafe['verified'] is False, "Unsafe command must fail verification"

    # Test 3: Bearing Wear Damping Verification
    wear_metrics = {
        "temperatureC": 52.0,
        "currentDrawMa": 450.0,
        "fftPeakMagnitude": 0.88,
        "pwmDutyCycle": 200
    }
    damped_command = {
        "action": "RECALIBRATE_PID",
        "parameters": {"kp": 0.9, "ki": 0.02, "kd": 0.45, "targetPwm": 130}
    }
    result_damped = simulate_policy_forward(wear_metrics, damped_command)
    print(f"[TEST 3] Harmonic Damping (Kd 0.45): Verified={result_damped['verified']} (Pred Vib: {result_damped['predictedVibrationG']}g)")
    assert result_damped['verified'] is True, "Damped PID should pass verification"

    print("ALL SERVERLESS VERIFIER TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Nebius Policy Verifier")
    parser.add_argument('--self-test', action='store_true', help="Run automated self-test suite")
    parser.add_argument('--payload', type=str, help="JSON input payload containing frame and command")
    parser.add_argument('--file', type=str, help="Path to a JSON file containing frame and command")

    args = parser.parse_args()

    if args.self_test:
        run_self_test()
        sys.exit(0)

    if args.payload:
        data = json.loads(args.payload)
    elif args.file:
        with open(args.file, 'r', encoding='utf-8-sig') as handle:
            data = json.load(handle)
    else:
        # Read from stdin
        data = json.load(sys.stdin)

    frame_metrics = data.get('metrics', {})
    command = data.get('command', {})

    res = simulate_policy_forward(frame_metrics, command)
    print(json.dumps(res, indent=2))

    # Exit non-zero when the policy violates SOA bounds so Serverless Job terminal
    # state (COMPLETED vs FAILED) encodes the verification verdict.
    sys.exit(0 if res['verified'] else 2)
