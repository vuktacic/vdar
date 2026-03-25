#include <TMC2209.h>
#include <TFMiniPlus.h>
#include "config.h"

namespace telemetry {
    HardwareSerial serial_lidar(2);

    TFMiniPlus lidar;

    void setup_serial() {
        serial_lidar.begin(LUNA_BAUD, SERIAL_8N1, LUNA_RX, LUNA_TX);
    }

    void setup_lidar() {
        lidar.begin(&serial_lidar);

        lidar.restoreFactorySettings();

        lidar.setBaudRate(LUNA_BAUD);

        lidar.setFrameRate(LUNA_HZ);
        lidar.setMeasurementTo(TFMINI_MEASUREMENT_CM);
    }

    bool turret_endstop_triggered() {
        return digitalRead(TURRET_ENDSTOP) == HIGH;
    }

    bool sweeper_endstop_triggered() {
        return digitalRead(SWEEPER_ENDSTOP) == HIGH;
    }

    uint16_t get_distance() {
        if (lidar.readData()) {
            return lidar.getDistance();
        }
        else {
            return -1;
        }
    }
}