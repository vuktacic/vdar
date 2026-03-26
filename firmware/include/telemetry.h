#pragma once
#include <Arduino.h>

namespace telemetry {
    extern void setup_serial();
    extern void setup_lidar();
    extern bool turret_endstop_triggered();
    extern bool sweeper_endstop_triggered();
    extern uint16_t get_distance();
}