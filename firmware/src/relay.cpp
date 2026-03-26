#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h"
#include "motion.h"
#include "telemetry.h"

namespace relay {
    void debug(String message);

    void setup_serial() {
        Serial.begin(115200);
    }

    bool setup_relay() {
        Serial.println("esp_connect");

        // Wait for "laptop_connect"
        while(true) {
            if(Serial.available()) {
                String line = Serial.readStringUntil('\n');
                line.trim();
                if(line == "laptop_connect") {
                    relay::debug("Connected successfully");
                    break;
                }
            }
        }

        return true;
    }

    void debug(String message) {
        Serial.println("Debug: " + message);
    }

    String read_instruction() {
        if(Serial.available()) {
            String line = Serial.readStringUntil('\n');
            line.trim();

            return line;
        }
        return "";
    }

    void send(int distance, float azimuth, float elevation) {
        Serial.println("scan_data " + String(distance) + " " + String(azimuth) + " " + String(elevation));
    }
}