#include <Arduino.h>
#include "config.h"
#include "motion.h"
#include "relay.h"
#include "telemetry.h"
#include "kinematics.h"
#include "test.h"

String runtime_status = "idle";

uint32_t luna_us = 0;
uint32_t sweeper_us = 0;

void setup() {

    relay::setup_serial();
    relay::setup_relay();

    pinMode(TMC_EN, OUTPUT);
    pinMode(TURRET_ENDSTOP, INPUT_PULLDOWN);
    pinMode(SWEEPER_ENDSTOP, INPUT_PULLDOWN);

    digitalWrite(TMC_EN, LOW);

    relay::debug("Pins configured");

    delay(500);

    motion::setup_serial();
    telemetry::setup_serial();
    // Ensure the hardware UART used for the lidar is opened here so the test is self-contained.
    // This opens UART1 with the configured pins and baud so tests can manually write/read bytes.
    Serial1.begin(LUNA_BAUD, SERIAL_8N1, LUNA_RX, LUNA_TX);

    motion::setup_controllers();
    motion::enable_controllers();

    telemetry::setup_lidar();

    // Print homing velocity (in microsteps per period) via kinematics helper
    relay::debug(String((int)kinematics::turret_homing_usteps_per_period()));

    runtime_status = "idle";
    relay::send_status(runtime_status);

    if(AUTO_HOME) {
        runtime_status = "homing";
        relay::send_status(runtime_status);
        motion::home();
        runtime_status = "idle";
        relay::send_status(runtime_status);
    }

    if(TESTS_ENABLED) {
        if(TESTS_AUTO_RUN) {
            test::lidar_check();
            test::endstop_check();
        }
    }

    luna_us = micros();
    sweeper_us = micros();
}

void loop() {
    relay::debug(String(telemetry::get_distance() / 2.54));

    String instruction = relay::read_instruction();

    if(instruction == "") { return; }

    if(instruction == "status") {
        relay::send_status(runtime_status);
        return;
    }

    if(instruction == "stop") {
        motion::stop();
        runtime_status = "idle";
        relay::send_status(runtime_status);
        return;
    }

    if(TESTS_ENABLED) {
        if(instruction == "lidar") {
            test::lidar_check();
            relay::send_status(runtime_status);
            return;
        }
        if(instruction == "lidar_two_way") {
            test::lidar_two_way_check();
            relay::send_status(runtime_status);
            return;
        }
        if(instruction == "lidar_restore_manual") {
            test::lidar_restore_manual();
            relay::send_status(runtime_status);
            return;
        }

        if(instruction == "endstops") {
            test::endstop_check();
            relay::send_status(runtime_status);
            return;
        }

        if(instruction == "lidar_stream") {
            test::lidar_stream();
            relay::send_status(runtime_status);
            return;
        }

        if(instruction == "endstop_stream") {
            test::endstop_stream();
            relay::send_status(runtime_status);
            return;
        }

        if(instruction == "motor_run") {
            if(TESTS_ALLOW_ACTUATE) {
                test::motor_run_check();
            } else {
                relay::debug("motor_run disabled in config.h");
            }
            relay::send_status(runtime_status);
            return;
        }

        if(instruction == "motor_move") {
            if(TESTS_ALLOW_ACTUATE) {
                test::motor_move_check();
            } else {
                relay::debug("motor_move disabled in config.h");
            }
            relay::send_status(runtime_status);
            return;
        }

        if(instruction == "sweeper_test") {
            runtime_status = "testing";
            relay::send_status(runtime_status);
            test::sweeper_test();
            runtime_status = "idle";
            relay::send_status(runtime_status);
            return;
        }

        if(instruction == "sweeper_test_90") {
            runtime_status = "testing";
            relay::send_status(runtime_status);
            test::sweeper_test_constant_speed();
            runtime_status = "idle";
            relay::send_status(runtime_status);
            return;
        }
    }
}
