#pragma once
#include <WString.h>

namespace relay {
    extern bool setup_serial();
    extern bool setup_relay();
    extern bool is_connected();
    extern void debug(String message);
    extern String read_instruction();
    extern void send(int distance, float azimuth, float elevation);
}