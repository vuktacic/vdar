#include <Arduino.h>
#include "config.h"
#include "motion.h"
#include "relay.h"
#include "telemetry.h"
#include "kinematics.h"

void setup() {
    pinMode(TMC_EN, OUTPUT);
    pinMode(TURRET_ENDSTOP, INPUT_PULLDOWN);
    pinMode(SWEEPER_ENDSTOP, INPUT_PULLDOWN);

    motion::setup_serial();
    telemetry::setup_serial();

    motion::setup_controllers();
    motion::enable_controllers();

    telemetry::setup_lidar();

    if(AUTO_HOME) {
        motion::home_turret();
        motion::home_sweeper();
    }
}

void loop() {
}