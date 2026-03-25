#include "config.h"
#include "kinematics.h"
#include "telemetry.h"

namespace motion {

    int current_turret_usteps = 0;
    int current_sweeper_usteps = 0;

    float get_turret_degrees() {
        return fmod((current_turret_usteps / (float)TURRET_USTEPS_TO_DEGREES) + 360.0f, 360.0f);
    }

    float get_sweeper_degrees() {
        return current_sweeper_usteps / (float)SWEEPER_USTEPS_TO_DEGREES;
    }

    HardwareSerial serial_motor(1);

    TMC2209 turret_motor;
    TMC2209 sweeper_motor;

    void setup_serial() {
        serial_motor.begin(TMC_BAUD, SERIAL_8N1, TMC_RX, TMC_TX);
    }

    void setup_controllers() {
        turret_motor.setup(serial_motor, TMC_BAUD, TMC2209::SERIAL_ADDRESS_0, TMC_RX, TMC_TX);
        sweeper_motor.setup(serial_motor, TMC_BAUD, TMC2209::SERIAL_ADDRESS_1, TMC_RX, TMC_TX);

        turret_motor.setHardwareEnablePin(TMC_EN);
        sweeper_motor.setHardwareEnablePin(TMC_EN);

        turret_motor.setMicrostepsPerStepPowerOfTwo(TURRET_USTEPS);
        sweeper_motor.setMicrostepsPerStepPowerOfTwo(SWEEPER_USTEPS);

        turret_motor.setStandstillMode(TMC2209::FREEWHEELING);
        sweeper_motor.setStandstillMode(TMC2209::STRONG_BRAKING);

    }

    void enable_controllers() {
        turret_motor.enable();
        sweeper_motor.enable();
    }

    void disable_controllers() {
        turret_motor.disable();
        sweeper_motor.disable();
    }

    void run_turret_velocity(int32_t velocity) {
        turret_motor.moveAtVelocity(velocity);
    }

    void run_sweeper_velocity(int32_t velocity) {
        sweeper_motor.moveAtVelocity(velocity);
    }

    void home_turret() {
        turret_motor.setStandstillMode(TMC2209::STRONG_BRAKING);

        run_turret_velocity(TURRET_HOMING_VELOCITY);
        while(telemetry::turret_endstop_triggered()) { }
        run_turret_velocity(0);

        run_turret_velocity(TURRET_HOMING_VELOCITY);
        while(!telemetry::turret_endstop_triggered()) { }
        run_turret_velocity(0);


        current_turret_usteps = 0;
        turret_motor.setStandstillMode(TMC2209::FREEWHEELING);
    }

    void home_sweeper() {
        sweeper_motor.setStandstillMode(TMC2209::STRONG_BRAKING);

        int32_t down_target_usteps = 90.0f * SWEEPER_USTEPS_TO_DEGREES;
        int32_t up_target_usteps = 180.0f * SWEEPER_USTEPS_TO_DEGREES;
        uint32_t down_duration_ms = (down_target_usteps * 1000.0f) / SWEEPER_HOMING_USTEPS_PER_SECOND;
        uint32_t up_duration_limit_ms = (up_target_usteps * 1000.0f) / SWEEPER_HOMING_USTEPS_PER_SECOND;

        run_sweeper_velocity(-SWEEPER_HOMING_VELOCITY);
        delay(down_duration_ms);
        run_sweeper_velocity(0);

        uint32_t up_start_ms = millis();
        run_sweeper_velocity(SWEEPER_HOMING_VELOCITY);
        while(!telemetry::sweeper_endstop_triggered() && (millis() - up_start_ms < up_duration_limit_ms)){ }
        run_sweeper_velocity(0);

        if(telemetry::sweeper_endstop_triggered()){
            current_sweeper_usteps = 0;
        }

        sweeper_motor.setStandstillMode(TMC2209::STRONG_BRAKING);
    }
}