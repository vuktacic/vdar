#include "kinematics.h"
#include "config.h"

namespace {
    // helper computes microsteps per degree using integer power-of-two microstep factor
    static inline float compute_usteps_per_degree(unsigned steps_per_rev, float gear_ratio, unsigned usteps_power) {
        return (steps_per_rev * gear_ratio * (1UL << usteps_power)) / 360.0f;
    }
}

namespace kinematics {

    float turret_usteps_to_degrees() {
        return compute_usteps_per_degree(NEMA_STEPS_PER_REV, TURRET_GEAR_RATIO, TURRET_USTEPS);
    }

    float sweeper_usteps_to_degrees() {
        return compute_usteps_per_degree(NEMA_STEPS_PER_REV, SWEEPER_GEAR_RATIO, SWEEPER_USTEPS);
    }

    float turret_usteps_per_second() {
        // kept for compatibility; compute via rps_to_usteps_per_period core function
        return rps_to_usteps_per_period(TURRET_VELOCITY_RPS, NEMA_STEPS_PER_REV, TURRET_GEAR_RATIO, TURRET_USTEPS) * ESP_CLOCK;
    }

    float turret_usteps_per_period(float rps) {
        return rps_to_usteps_per_period(rps, NEMA_STEPS_PER_REV, TURRET_GEAR_RATIO, TURRET_USTEPS, ESP_CLOCK);
    }

    float sweeper_usteps_per_period(float rps) {
        return rps_to_usteps_per_period(rps, NEMA_STEPS_PER_REV, SWEEPER_GEAR_RATIO, SWEEPER_USTEPS, ESP_CLOCK);
    }

    float turret_homing_usteps_per_second() {
        return rps_to_usteps_per_period(TURRET_HOMING_VELOCITY_RPS, NEMA_STEPS_PER_REV, TURRET_GEAR_RATIO, TURRET_USTEPS) * ESP_CLOCK;
    }

    float turret_homing_usteps_per_period() {
        return rps_to_usteps_per_period(TURRET_HOMING_VELOCITY_RPS, NEMA_STEPS_PER_REV, TURRET_GEAR_RATIO, TURRET_USTEPS, ESP_CLOCK);
    }

    float sweeper_homing_usteps_per_second() {
        return rps_to_usteps_per_period(SWEEPER_HOMING_VELOCITY_RPS, NEMA_STEPS_PER_REV, SWEEPER_GEAR_RATIO, SWEEPER_USTEPS) * ESP_CLOCK;
    }

    float sweeper_homing_usteps_per_period() {
        return rps_to_usteps_per_period(SWEEPER_HOMING_VELOCITY_RPS, NEMA_STEPS_PER_REV, SWEEPER_GEAR_RATIO, SWEEPER_USTEPS, ESP_CLOCK);
    }

}

// Core conversion function: convert rotations-per-second to microsteps-per-period
// Formula: usteps_per_period = rps * steps_per_rev * gear_ratio * (1 << usteps_power) / esp_clock
float kinematics::rps_to_usteps_per_period(float rps, unsigned steps_per_rev, float gear_ratio, unsigned usteps_power, float esp_clock) {
    // compute usteps/sec then divide by periods/sec (esp_clock)
    float usteps_per_second = rps * (float)steps_per_rev * gear_ratio * (1UL << usteps_power);
    return usteps_per_second / esp_clock;
}
