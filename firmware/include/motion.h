#pragma once
#include <Arduino.h>

namespace motion {
    extern void setup_serial();
    extern void setup_controllers();
    extern void enable_controllers();
    extern void disable_controllers();
    extern void run_turret_velocity(int32_t velocity);
    extern void run_sweeper_velocity(int32_t velocity);
    extern void home_turret();
    extern void home_sweeper();
}