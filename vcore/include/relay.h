#pragma once
#include <WString.h>

namespace relay {
    extern bool setup_serial();
    extern bool setup_relay();
    extern void debug(String message);
    extern String read_instruction();
    extern void send_status(String status);
    extern void send(int distance, float azimuth, float elevation);
}