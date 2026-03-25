#include <Arduino.h>

#include "config.h"
#include "motion.h"
#include "telemetry.h"

namespace relay {
    void setup_serial() {
        Serial.begin(PC_BAUD);
    }

    void setup_wifi() {}

    void setup_relay() {
        // TODO: Add some shit here to exchange settings and other funky things
    }
}