#pragma once
#include "config.h"

// Keep only rotation-per-second settings here. Conversion helpers moved to kinematics.cpp
#define TURRET_VELOCITY_RPS ((LUNA_HZ / 360.0f) * (TURRET_REVERSE ? -1.0f : 1.0f))

// Homing velocity rps macro (keep as-is)
#define TURRET_HOMING_VELOCITY_RPS (TURRET_HOMING_RPS * (TURRET_REVERSE ? -1.0f : 1.0f))

#define SWEEPER_HOMING_VELOCITY_RPS (SWEEPER_HOMING_RPS * (SWEEPER_REVERSE ? -1.0f : 1.0f))

// #define W_BASE (TURRET_VELOCITY_RPS * 1.0f / 360.0f)
#define W_BASE (12 * 1.0f / 360.0f)

// Declarations for conversion helpers implemented in kinematics.cpp
namespace kinematics {
    // Returns microsteps per degree for turret and sweeper respectively
    float turret_usteps_to_degrees();
    float sweeper_usteps_to_degrees();

    // Convenience functions used to replace former macros
    float turret_usteps_per_second();
    float turret_usteps_per_period(float rps);
    float sweeper_usteps_per_period(float rps);
    float turret_homing_usteps_per_second();
    float turret_homing_usteps_per_period();

    float sweeper_homing_usteps_per_second();
    float sweeper_homing_usteps_per_period();

    // Core conversion function: convert rotations-per-second to microsteps-per-period
    // Signature: rps_to_usteps_per_period(rps, steps_per_rev, gear_ratio, usteps_power, esp_clock)
    // Formula used: usteps_per_period = (rps * steps_per_rev * gear_ratio * (1 << usteps_power)) / esp_clock
    float rps_to_usteps_per_period(float rps, unsigned steps_per_rev, float gear_ratio, unsigned usteps_power, float esp_clock = ESP_CLOCK);

}
