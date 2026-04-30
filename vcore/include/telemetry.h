#pragma once
#include <Arduino.h>

namespace telemetry {
    extern void setup_serial();
    extern void setup_lidar();
    extern bool turret_endstop_triggered();
    extern bool sweeper_endstop_triggered();
    extern uint16_t get_distance();
    // Send raw command bytes to the lidar and read raw response. Returns true if any bytes were read.
    extern bool raw_command_exchange(const uint8_t* cmd, size_t cmd_len, uint8_t* resp, size_t max_resp_len, size_t &out_len, uint32_t timeout_ms = 200);
}
