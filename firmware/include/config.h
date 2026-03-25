#pragma once
#include <HardwareSerial.h>
#include <TMC2209.h>

// Pin Definitions
#define TMC_EN 26
#define TURRET_ENDSTOP 23
#define SWEEPER_ENDSTOP 22
#define LUNA_TX 19
#define LUNA_RX 18
#define TMC_TX 17
#define TMC_RX 16

// Communication
#define ESP_CLOCK (12000000.0f / (1UL << 24))

#define LUNA_BAUD 115200
#define LUNA_HZ 250

#define TMC_BAUD 38400

#define PC_BAUD 115200
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
#define TURRET_USTEPS 8

#define SWEEPER_PINION_TEETH 25
#define SWEEPER_PULLEY_TEETH 45
#define SWEEPER_GEAR_RATIO ((float)SWEEPER_PULLEY_TEETH / (float)SWEEPER_PINION_TEETH)
#define SWEEPER_USTEPS 0

// Settings
#define AUTO_HOME true

#define TURRET_REVERSE false
#define SWEEPER_REVERSE false