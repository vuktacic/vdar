#pragma once
#include <Arduino.h>

namespace test {
    // Non-actuating checks
    void lidar_check();        // Read and report a lidar sample
    void endstop_check();      // Read and report both endstops

    // Actuating checks (require TESTS_ALLOW_ACTUATE)
    void motor_run_check();    // Short motor run to verify drivers
    void motor_move_check();   // Move and measure delta (turret) to verify movement
    void sweeper_test();       // Sweep from -85 to 85 degrees with cosine speed profile
    void sweeper_test_constant_speed();  // Move exactly 90 degrees at constant slow speed
    
    // Continuous streaming interfaces (stop by sending the string "stop" over serial)
    void lidar_stream();
    void endstop_stream();
    // Two-way UART check: send command to lidar and read response
    void lidar_two_way_check();
    void lidar_restore_manual();
}
