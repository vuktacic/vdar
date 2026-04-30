#include <TMC2209.h>
#include <TFMiniPlus.h>
#include "config.h"
#include "relay.h"

namespace telemetry {
    HardwareSerial serial_lidar(1);

    TFMiniPlus lidar;

    void setup_serial() {
        serial_lidar.begin(LUNA_BAUD, SERIAL_8N1, LUNA_RX, LUNA_TX);
        relay::debug("Lidar serial configured");
    }

    void setup_lidar() {
        relay::debug("Configuring lidar...");
        lidar.begin(&serial_lidar);
        relay::debug("Lidar serial opened");

        lidar.restoreFactorySettings();
        relay::debug("Factory settings restored");

        lidar.setBaudRate(LUNA_BAUD);
        relay::debug("Lidar baud rate set");
    
        lidar.setFrameRate(LUNA_HZ);
        relay::debug("Lidar Hz set");

        lidar.setMeasurementTo(TFMINI_MEASUREMENT_CM);
        relay::debug("Lidar measurement units set");

        relay::debug("Lidar configured");
    }

    // Send raw command bytes over the lidar serial and collect a response
    // cmd: pointer to command bytes
    // cmd_len: length of command to send
    // resp: buffer to write response into
    // max_resp_len: capacity of resp
    // out_len: number of bytes actually read
    bool raw_command_exchange(const uint8_t* cmd, size_t cmd_len, uint8_t* resp, size_t max_resp_len, size_t &out_len, uint32_t timeout_ms = 200) {
        // Use the HardwareSerial instance serial_lidar defined in this translation unit
        // Ensure serial_lidar is initialized (begin called)
        // flush input
        while (serial_lidar.available()) { serial_lidar.read(); }

        // write command
        for (size_t i = 0; i < cmd_len; ++i) {
            serial_lidar.write(cmd[i]);
        }
        serial_lidar.flush();

        uint32_t start = millis();
        out_len = 0;
        // Read until timeout or buffer full
        while (millis() - start < timeout_ms && out_len < max_resp_len) {
            int avail = serial_lidar.available();
            if (avail > 0) {
                int toread = min((size_t)avail, max_resp_len - out_len);
                int r = serial_lidar.readBytes(&resp[out_len], toread);
                if (r > 0) out_len += r;
            } else {
                delay(5);
            }
        }

        return out_len > 0;
    }

    

    bool turret_endstop_triggered() {
        return digitalRead(TURRET_ENDSTOP) == HIGH;
    }

    bool sweeper_endstop_triggered() {
        return digitalRead(SWEEPER_ENDSTOP) == HIGH;
    }

    uint16_t get_distance() {
        if(lidar.readData()) {
            return lidar.getDistance();
        }
        else {
            return -1;
        }
    }
}
