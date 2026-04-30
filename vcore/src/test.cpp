#include "test.h"
#include "relay.h"
#include "motion.h"
#include "telemetry.h"
#include "config.h"
#include "kinematics.h"

namespace test {

    void lidar_check() {
        relay::debug("test: lidar_check start");
        uint16_t d = telemetry::get_distance();
        relay::debug("lidar distance: " + String(d));
        relay::send(d, motion::get_azimuth(), motion::get_elevation());
        relay::debug("test: lidar_check done");
    }

    void endstop_check() {
        relay::debug("test: endstop_check start");
        bool t = telemetry::turret_endstop_triggered();
        bool s = telemetry::sweeper_endstop_triggered();
        relay::debug("turret_endstop: " + String(t ? 1 : 0));
        relay::debug("sweeper_endstop: " + String(s ? 1 : 0));
        relay::debug("test: endstop_check done");
    }

    void lidar_stream() {
        relay::debug("test: lidar_stream start (send 'stop' to end)");
        while (true) {
            if (Serial.available()) {
                String cmd = Serial.readStringUntil('\n');
                cmd.trim();
                if (cmd == "stop") { relay::debug("test: lidar_stream stopped"); break; }
            }
            uint16_t d = telemetry::get_distance();
            // Output a simple CSV-like line for easy parsing in VSCode terminal
            Serial.println("LIDAR," + String(d));
            delay(100);
        }
    }

    void endstop_stream() {
        relay::debug("test: endstop_stream start (send 'stop' to end)");
        while (true) {
            if (Serial.available()) {
                String cmd = Serial.readStringUntil('\n');
                cmd.trim();
                if (cmd == "stop") { relay::debug("test: endstop_stream stopped"); break; }
            }
            bool t = telemetry::turret_endstop_triggered();
            bool s = telemetry::sweeper_endstop_triggered();
            Serial.println("ENDSTOPS," + String(t ? 1 : 0) + "," + String(s ? 1 : 0));
            delay(100);
        }
    }

    void lidar_two_way_check() {
        relay::debug("test: lidar_two_way_check start");
        // TFMiniPlus GetVersion command: 5A 04 01 5F
        const uint8_t cmd[] = {0x5A, 0x04, 0x01, 0x5F};
        uint8_t resp[64];
        size_t out_len = 0;

        // Flush Serial1 input
        while (Serial1.available()) { Serial1.read(); }

        // Write command directly to UART1
        for (size_t i = 0; i < sizeof(cmd); ++i) { Serial1.write(cmd[i]); }
        Serial1.flush();

        // Read raw response for up to 300ms
        uint32_t start = millis();
        while (millis() - start < 300 && out_len < sizeof(resp)) {
            int avail = Serial1.available();
            if (avail > 0) {
                int toread = min((size_t)avail, sizeof(resp) - out_len);
                int r = Serial1.readBytes(&resp[out_len], toread);
                if (r > 0) out_len += r;
            } else {
                delay(5);
            }
        }

        if (out_len == 0) {
            relay::debug("lidar_two_way: no response");
        } else {
            String s = "resp:";
            for (size_t i = 0; i < out_len; ++i) {
                char buf[8];
                sprintf(buf, " %02X", resp[i]);
                s += String(buf);
            }
            relay::debug(s);
        }

        // Minimal two-way confirmation: do not call high-level parser here (it may be uninitialized).
        // The raw response above confirms two-way UART. If you want parsed distance, run telemetry::setup_lidar() first.
        relay::debug("test: lidar_two_way_check done");
    }

    void lidar_restore_manual() {
        relay::debug("test: lidar_restore_manual start");
        // RestoreFactorySettingsCommand in TFMiniPlusConstants.h is {0x5A, 0x04, 0x10, 0x6E}
        const uint8_t cmd[] = {0x5A, 0x04, 0x10, 0x6E};
        uint8_t resp[64];
        size_t out_len = 0;

        // Flush Serial1 input
        while (Serial1.available()) { Serial1.read(); }

        // Write command
        for (size_t i = 0; i < sizeof(cmd); ++i) { Serial1.write(cmd[i]); }
        Serial1.flush();

        // Read response for up to 300ms
        uint32_t start = millis();
        out_len = 0;
        while (millis() - start < 300 && out_len < sizeof(resp)) {
            int avail = Serial1.available();
            if (avail > 0) {
                int toread = min((size_t)avail, sizeof(resp) - out_len);
                int r = Serial1.readBytes(&resp[out_len], toread);
                if (r > 0) out_len += r;
            } else {
                delay(5);
            }
        }

        if (out_len == 0) {
            relay::debug("lidar_restore_manual: no response");
        } else {
            String s = "resp:";
            for (size_t i = 0; i < out_len; ++i) {
                char buf[8];
                sprintf(buf, " %02X", resp[i]);
                s += String(buf);
            }
            relay::debug(s);
        }

        relay::debug("test: lidar_restore_manual done");
    }

    void motor_run_check() {
        if (!TESTS_ALLOW_ACTUATE) { relay::debug("test: motor_run_check disabled"); return; }
        relay::debug("test: motor_run_check start");
        const int32_t velocity = 20000;
        const uint32_t duration_ms = 1000;
        motion::enable_controllers();
        motion::run_turret_velocity(velocity);
        uint32_t start = millis();
        while (millis() - start < duration_ms) {
            // motion::heartbeat();
            // if (telemetry::turret_endstop_triggered()) { relay::debug("turret endstop hit"); break; }
        }
        motion::stop();
        motion::disable_controllers();
        relay::debug("test: motor_run_check done");
    }

    void motor_move_check() {
        if (!TESTS_ALLOW_ACTUATE) { relay::debug("test: motor_move_check disabled"); return; }
        relay::debug("test: motor_move_check start");
        // Measure azimuth before and after a short move
        float before = motion::get_azimuth();
        const int32_t velocity = 100;
        const uint32_t duration_ms = 300;
        motion::enable_controllers();
        motion::run_turret_velocity(velocity);
        uint32_t start = millis();
        while (millis() - start < duration_ms) {
            motion::heartbeat();
            if (telemetry::turret_endstop_triggered()) { relay::debug("turret endstop hit during move"); break; }
        }
        motion::stop();
        float after = motion::get_azimuth();
        relay::debug("az before: " + String(before) + " after: " + String(after));
        motion::disable_controllers();
        relay::debug("test: motor_move_check done");
    }

    void sweeper_test() {
        if (!TESTS_ALLOW_ACTUATE) { relay::debug("test: sweeper_test disabled"); return; }

        relay::debug("test: sweeper_test start");
        motion::enable_controllers();
        motion::stop();
        motion::set_elevation(-85.0f);
        motion::heartbeat();

        const float target_elevation = 85.0f;
        const uint32_t heartbeat_period_us = 1000000.0f / (float)SWEEPER_HEARTBEAT_HZ;
        uint32_t last_tick_us = micros();

        motion::run_sweeper_velocity(0);

        while (motion::get_elevation() < target_elevation) {
            String cmd = relay::read_instruction();
            if (cmd == "stop") {
                relay::debug("test: sweeper_test stopped");
                break;
            }

            uint32_t now = micros();
            if (now - last_tick_us >= heartbeat_period_us) {
                motion::heartbeat();
                motion::sweeper_heartbeat();
                last_tick_us = now;
            } else {
                delay(1);
            }
        }

        motion::stop();
        relay::debug("test: sweeper_test done");
    }

    void sweeper_test_constant_speed() {
        if (!TESTS_ALLOW_ACTUATE) { relay::debug("test: sweeper_test_constant_speed disabled"); return; }

        relay::debug("test: sweeper_test_constant_speed start");
        motion::enable_controllers();
        motion::stop();

        const float constant_rps = 0.1f;
        const float target_degrees = 90.0f;
        const float start_elevation = motion::get_elevation();
        const float target_elevation = start_elevation + target_degrees;

        int32_t velocity_usteps_per_second = (int32_t)(kinematics::sweeper_usteps_per_period(constant_rps) * ESP_CLOCK);
        motion::run_sweeper_velocity(velocity_usteps_per_second);

        relay::debug("Moving at constant " + String(constant_rps) + " RPS (" + String(velocity_usteps_per_second) + " usteps/s)");
        relay::debug("Start: " + String(start_elevation) + " degrees, Target: " + String(target_elevation) + " degrees");

        uint32_t start_ms = millis();
        while (motion::get_elevation() < target_elevation) {
            String cmd = relay::read_instruction();
            if (cmd == "stop") {
                relay::debug("test: sweeper_test_constant_speed stopped");
                break;
            }
            delay(10);
        }

        motion::stop();
        uint32_t elapsed_ms = millis() - start_ms;
        float final_elevation = motion::get_elevation();
        float actual_degrees = final_elevation - start_elevation;

        relay::debug("Final: " + String(final_elevation) + " degrees, Moved: " + String(actual_degrees) + " degrees in " + String(elapsed_ms) + " ms");
        relay::debug("test: sweeper_test_constant_speed done");
    }

}
