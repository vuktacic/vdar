#pragma once
#include <Arduino.h>

namespace motion {
    extern float get_azimuth();
    extern float get_elevation();
    extern void setup_serial();
    extern void setup_controllers();
    extern void enable_controllers();
    extern void disable_controllers();
    extern void run_turret_velocity(int32_t velocity);
    extern void run_sweeper_velocity(int32_t velocity);
    extern void home_turret();
    extern void home_sweeper();
    extern void heartbeat();
    extern void sweeper_heartbeat();
    extern void home();
    extern void start_scan();
    extern bool scan_finished();
    extern void stop();
}