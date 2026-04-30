#pragma once
#include <HardwareSerial.h>
#include <TMC2209.h>

// Pin Definitions
#define TMC_EN 26
#define TURRET_ENDSTOP 23
#define SWEEPER_ENDSTOP 22
#define LUNA_TX 19
#define LUNA_RX 18
#define TMC_TX 16
#define TMC_RX 17

// Communication
#define ESP_CLOCK (12000000.0f / (1UL << 24))

#define LUNA_BAUD 115200
#define LUNA_HZ 250

#define TMC_BAUD 115200

#define HEARTBEAT_MS 1000
#if __has_include("secrets.h")
    #include "secrets.h"
#else
    #error "No secrets.h - Copy secrets.h.example to secrets.h and replace info."
#endif

// Motors
#define NEMA_STEPS_PER_REV 200

#define TURRET_PINION_TEETH 20
#define TURRET_PULLEY_TEETH 144
#define TURRET_GEAR_RATIO ((float)TURRET_PULLEY_TEETH / (float)TURRET_PINION_TEETH)
// #define TURRET_GEAR_RATIO 1
#define TURRET_USTEPS 4

#define SWEEPER_PINION_TEETH 25
#define SWEEPER_PULLEY_TEETH 45
// #define SWEEPER_GEAR_RATIO ((float)SWEEPER_PULLEY_TEETH / (float)SWEEPER_PINION_TEETH)
#define SWEEPER_GEAR_RATIO 1
#define SWEEPER_USTEPS 4

// Settings
#define AUTO_HOME false

#define TURRET_REVERSE false
#define SWEEPER_REVERSE false

#define TURRET_HOMING_RPS 0.5f
#define SWEEPER_HOMING_RPS 0.5f

#define SWEEPER_HEARTBEAT_HZ 50.0f

#define SWEEP_ANGLE 80.0F

// Test configuration (simple compile-time flags)
// Use #define constants for configuration. Do NOT use preprocessor conditionals
// (#if/#ifdef) for control flow in code; prefer runtime if statements for
// gating behavior. KISS.
#define TESTS_ENABLED true
#define TESTS_AUTO_RUN false
#define TESTS_ALLOW_ACTUATE true
