#include "config.h"
#include "kinematics.h"
#include "telemetry.h"
#include "relay.h"

namespace motion {

    int current_turret_usteps = 0;
    int current_sweeper_usteps = 0;
    int current_turret_velocity_usteps_per_second = 0;
    int current_sweeper_velocity_usteps_per_second = 0;

    uint32_t last_heartbeat_us = 0;

    float get_azimuth() {
        return fmod((current_turret_usteps / (float)TURRET_USTEPS_TO_DEGREES) + 360.0f, 360.0f);
    }

    float get_elevation() {
        return current_sweeper_usteps / (float)SWEEPER_USTEPS_TO_DEGREES;
    }

    HardwareSerial serial_motor(1);

    TMC2209 turret_motor;
    TMC2209 sweeper_motor;

    void setup_serial() {
        serial_motor.begin(TMC_BAUD, SERIAL_8N1, TMC_RX, TMC_TX);
        relay::debug("Motor serial configured");
    }

    void setup_controllers() {
        turret_motor.setup(serial_motor, TMC_BAUD, TMC2209::SERIAL_ADDRESS_0, TMC_RX, TMC_TX);
        sweeper_motor.setup(serial_motor, TMC_BAUD, TMC2209::SERIAL_ADDRESS_1, TMC_RX, TMC_TX);
        relay::debug("Motor UART configured");

        turret_motor.setHardwareEnablePin(TMC_EN);
        sweeper_motor.setHardwareEnablePin(TMC_EN);
        relay::debug("Motor EN pin configured");

        turret_motor.setMicrostepsPerStepPowerOfTwo(TURRET_USTEPS);
        sweeper_motor.setMicrostepsPerStepPowerOfTwo(SWEEPER_USTEPS);
        relay::debug("Motor microsteps configured");

        turret_motor.setStandstillMode(TMC2209::FREEWHEELING);
        sweeper_motor.setStandstillMode(TMC2209::STRONG_BRAKING);
        relay::debug("Motor brake mode configured");

    }

    void enable_controllers() {
        turret_motor.enable();
        sweeper_motor.enable();
        relay::debug("Motors enabled");
    }

    void disable_controllers() {
        turret_motor.disable();
        sweeper_motor.disable();
        relay::debug("Motors disabled");
    }

    void run_turret_velocity(int32_t velocity) {
        turret_motor.moveAtVelocity(velocity);
        current_turret_velocity_usteps_per_second = velocity;
        relay::debug("Set turret velocity: " + String(velocity));
    }

    void run_sweeper_velocity(int32_t velocity) {
        sweeper_motor.moveAtVelocity(velocity);
        current_sweeper_velocity_usteps_per_second = velocity;
        relay::debug("Set sweeper velocity: " + String(velocity));
    }

    void home_turret() {
        turret_motor.setStandstillMode(TMC2209::STRONG_BRAKING);

        motion::run_turret_velocity(TURRET_HOMING_VELOCITY);
        while(telemetry::turret_endstop_triggered()) { }
        motion::run_turret_velocity(0);
        relay::debug("Turret out of endstop");

        motion::run_turret_velocity(TURRET_HOMING_VELOCITY);
        while(!telemetry::turret_endstop_triggered()) { }
        motion::run_turret_velocity(0);
        relay::debug("Turret at endstop");


        current_turret_usteps = 0;
        turret_motor.setStandstillMode(TMC2209::FREEWHEELING);
        relay::debug("Turret homed");
    }

    void home_sweeper() {
        sweeper_motor.setStandstillMode(TMC2209::STRONG_BRAKING);

        int32_t down_target_usteps = 90.0f * SWEEPER_USTEPS_TO_DEGREES;
        int32_t up_target_usteps = 180.0f * SWEEPER_USTEPS_TO_DEGREES;
        uint32_t down_duration_ms = (down_target_usteps * 1000.0f) / SWEEPER_HOMING_USTEPS_PER_SECOND;
        uint32_t up_duration_limit_ms = (up_target_usteps * 1000.0f) / SWEEPER_HOMING_USTEPS_PER_SECOND;

        motion::run_sweeper_velocity(-SWEEPER_HOMING_VELOCITY);
        delay(down_duration_ms);
        motion::run_sweeper_velocity(0);

        relay::debug("Sweeper moved down");

        uint32_t up_start_ms = millis();
        motion::run_sweeper_velocity(SWEEPER_HOMING_VELOCITY);
        while(!telemetry::sweeper_endstop_triggered() && (millis() - up_start_ms < up_duration_limit_ms)){ }
        motion::run_sweeper_velocity(0);
        relay::debug("Sweeper moved up");

        current_sweeper_usteps = 0;
        sweeper_motor.setStandstillMode(TMC2209::STRONG_BRAKING);
        relay::debug("Sweeper homed");
    }

    void heartbeat() {
        uint32_t dt_us = micros() - last_heartbeat_us;
        
        current_turret_usteps += (current_turret_velocity_usteps_per_second * dt_us) / 1000000.0f;
        current_sweeper_usteps += (current_sweeper_velocity_usteps_per_second * dt_us) / 1000000.0f;

        last_heartbeat_us = micros();
    }

    void sweeper_heartbeat() {
        float w_sweeper = W_BASE / cos(get_elevation() * (PI / 180.0f));
        int32_t usteps_per_period = w_sweeper * SWEEPER_USTEPS_TO_DEGREES * 360.0f / ESP_CLOCK;
        motion::run_sweeper_velocity(usteps_per_period);
    }

    void home() {
        home_turret();
        home_sweeper();
        relay::debug("Homing complete");
    }

    void start_scan() {
        int32_t down_target_usteps = 90.0f * SWEEPER_USTEPS_TO_DEGREES;
        uint32_t down_duration_ms = (down_target_usteps * 1000.0f) / SWEEPER_HOMING_USTEPS_PER_SECOND;
    
        motion::run_sweeper_velocity(-SWEEPER_HOMING_VELOCITY);
        delay(down_duration_ms);
        motion::run_sweeper_velocity(0);

        motion::run_turret_velocity(TURRET_VELOCITY);
    }

    bool scan_finished() {
        return motion::get_elevation() >= 90.0f;
    }

    void stop() {
        motion::run_turret_velocity(0);
        motion::run_sweeper_velocity(0);
    }
}