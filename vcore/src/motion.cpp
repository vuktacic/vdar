#include "config.h"
#include "kinematics.h"
#include "telemetry.h"
#include "relay.h"

namespace motion {

    HardwareSerial & serial_motor = Serial2;

    TMC2209 turret_motor;
    TMC2209 sweeper_motor;

    float current_turret_usteps = 0.0f;
    float start_turret_us = 0;
    float current_sweeper_usteps = 0.0f;
    float current_turret_velocity_usteps_per_second = 0.0f;
    float current_sweeper_velocity_usteps_per_second = 0.0f;

    uint32_t last_heartbeat_us = 0;

    float get_azimuth() {
        return fmod((current_turret_usteps / kinematics::turret_usteps_to_degrees()) + 360.0f, 360.0f);
    }

    float get_elevation() {
        return current_sweeper_usteps / kinematics::sweeper_usteps_to_degrees();
    }

    void set_elevation(float elevation) {
        current_sweeper_usteps = elevation * kinematics::sweeper_usteps_to_degrees();
    }

    void setup_serial() {
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

        turret_motor.setRunCurrent(40);
        sweeper_motor.setRunCurrent(70);

        turret_motor.enableStealthChop();
        // turret_motor.disableStealthChop();
        sweeper_motor.disableStealthChop(); // breaks the controller for some reason
        // sweeper_motor.enableStealthChop();

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

    void run_turret_velocity(float velocity) {
        turret_motor.moveAtVelocity((int32_t)velocity);
        current_turret_velocity_usteps_per_second = kinematics::usteps_per_period_to_usteps_per_second(velocity);
        current_turret_usteps = 0;
        start_turret_us = micros();
        // relay::debug("Set turret velocity: " + String((int)velocity));
    }

    void run_sweeper_velocity(float velocity) {
        sweeper_motor.moveAtVelocity((int32_t)velocity);
        current_sweeper_velocity_usteps_per_second = -kinematics::usteps_per_period_to_usteps_per_second(velocity);
        // relay::debug("Set sweeper velocity: " + String((int)velocity));
    }

    void home_turret() {
        turret_motor.setStandstillMode(TMC2209::STRONG_BRAKING);

        motion::run_turret_velocity((int)kinematics::turret_homing_usteps_per_period());
        while(telemetry::turret_endstop_triggered()) {}
        motion::run_turret_velocity(0);
        relay::debug("Turret out of endstop");

        motion::run_turret_velocity((int)kinematics::turret_homing_usteps_per_period());
        while(!telemetry::turret_endstop_triggered()) {}
        motion::run_turret_velocity(0);
        relay::debug("Turret at endstop");


        current_turret_usteps = 0;
        turret_motor.setStandstillMode(TMC2209::FREEWHEELING);
        relay::debug("Turret homed");
    }

    void home_sweeper() {
        sweeper_motor.setStandstillMode(TMC2209::STRONG_BRAKING);

        int32_t down_target_usteps = 90.0f * kinematics::sweeper_usteps_to_degrees();
        int32_t up_target_usteps = 180.0f * kinematics::sweeper_usteps_to_degrees();
        uint32_t down_duration_ms = (down_target_usteps * 1000.0f) / kinematics::sweeper_homing_usteps_per_second();
        uint32_t up_duration_limit_ms = (up_target_usteps * 1000.0f) / kinematics::sweeper_homing_usteps_per_second();

        motion::run_sweeper_velocity(-(int)kinematics::sweeper_homing_usteps_per_period());
        delay(down_duration_ms);
        motion::run_sweeper_velocity(0);

        relay::debug("Sweeper moved down");

        uint32_t up_start_ms = millis();
        motion::run_sweeper_velocity((int)kinematics::sweeper_homing_usteps_per_period());
        while(!telemetry::sweeper_endstop_triggered() && (millis() - up_start_ms < up_duration_limit_ms)) {}
        motion::run_sweeper_velocity(0);
        relay::debug("Sweeper moved up");

        current_sweeper_usteps = 0;
        sweeper_motor.setStandstillMode(TMC2209::STRONG_BRAKING);
        relay::debug("Sweeper homed");
    }

    void heartbeat() {
        uint32_t dt_us = micros() - last_heartbeat_us;

        // current_turret_usteps += (current_turret_velocity_usteps_per_second * dt_us) / 1000000.0f;

        current_turret_usteps = current_turret_velocity_usteps_per_second * ((float)(micros() - start_turret_us) / 1000000.0f);

        if(telemetry::turret_endstop_triggered()) {
            current_turret_usteps = 0;
            start_turret_us = micros();
            // relay::debug("Turret endstop hit, resetting turret position");
        }

        current_sweeper_usteps += (current_sweeper_velocity_usteps_per_second * dt_us) / 1000000.0f;

        last_heartbeat_us = micros();
    }

    void sweeper_heartbeat() {
        float w_sweeper = W_BASE / cos(get_elevation() * (PI / 180.0f));
        float usteps_per_period = kinematics::rps_to_usteps_per_period(w_sweeper, NEMA_STEPS_PER_REV, SWEEPER_GEAR_RATIO, SWEEPER_USTEPS, ESP_CLOCK);
        motion::run_sweeper_velocity(-usteps_per_period);

        // relay::debug("Sweeper heartbeat:" + String(usteps_per_period) + " usteps/s" + " w_sweeper: " + String(w_sweeper) + " get_elevation: " + String(get_elevation()));
    }

    void home() {
        home_turret();
        home_sweeper();
        relay::debug("Homing complete");
    }

    void start_scan() {
        int32_t down_target_usteps = -SWEEP_MIN * kinematics::sweeper_usteps_to_degrees(); // Need negative because of motor fuckery.
        uint32_t down_duration_ms = (down_target_usteps * 1000.0f) / kinematics::sweeper_homing_usteps_per_second();

        motion::run_sweeper_velocity((int)kinematics::sweeper_homing_usteps_per_period());
        delay(down_duration_ms);
        motion::run_sweeper_velocity(0);

        motion::set_elevation(SWEEP_MIN);


        motion::run_turret_velocity((int)kinematics::turret_usteps_per_period(TURRET_VELOCITY_RPS));
    }

    bool scan_finished() {
        return motion::get_elevation() >= SWEEP_MAX;
    }

    void stop() {
        motion::run_turret_velocity(0);
        motion::run_sweeper_velocity(0);
    }
}
