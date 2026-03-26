#include <Arduino.h>
#include "config.h"
#include "motion.h"
#include "relay.h"
#include "telemetry.h"
#include "kinematics.h"

void setup() {

    relay::setup_serial();
    relay::setup_relay();

    pinMode(TMC_EN, OUTPUT);
    pinMode(TURRET_ENDSTOP, INPUT_PULLDOWN);
    pinMode(SWEEPER_ENDSTOP, INPUT_PULLDOWN);

    relay::debug("Pins configured");

    motion::setup_serial();
    telemetry::setup_serial();

    motion::setup_controllers();
    motion::enable_controllers();

    telemetry::setup_lidar();

    if(AUTO_HOME) {
        motion::home();
    }
}

void loop() {
    String instruction = relay::read_instruction();

    if(instruction == "") { return;}

    if(instruction == "scan") {
        motion::heartbeat();
        motion::start_scan();

        uint32_t current_us = micros();
        
        while(true) {
            if(relay::read_instruction() == "stop") {
                motion::stop();
                break;
            }

            motion::heartbeat();

            if(micros() - current_us >= 1000000.0f / (float)LUNA_HZ) {
                relay::send(telemetry::get_distance(), motion::get_azimuth(), motion::get_elevation());
            }

            if(micros() - current_us >= 1000000.0f / (float)SWEEPER_HEARTBEAT_HZ) {
                motion::sweeper_heartbeat();
            }

            current_us = micros();

            if(motion::scan_finished()) {
                relay::debug("Scan finished");
                break;
            }
        }

        return;
    }

    if(instruction == "home") {
        motion::home();
        return;
    }
}