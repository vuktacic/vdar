#include <Arduino.h>

// Initialize HardwareSerial for UART1 (the TMC port)
// We specify port 1 because port 0 is USB and port 2 is LiDAR
HardwareSerial SerialTMC(1); 

void setup() {
  Serial.begin(115200); // USB Debug
  
  // LiDAR Port (UART2)
  // begin(baud, config, RX, TX)
  Serial2.begin(115200, SERIAL_8N1, 16, 17);
  
  // TMC Port (UART1) - Mapped to safe GPIOs
  // begin(baud, config, RX, TX)
  SerialTMC.begin(115200, SERIAL_8N1, 2, 4);

  Serial.println("--- Dual Hardware UART Stress Test ---");
}

void loop() {
  String payload = "UART_STRESS_TEST";
  
  // --- TEST PORT 2 (LiDAR) ---
  unsigned long start2 = micros();
  Serial2.print(payload);
  while(Serial2.available() < payload.length()) {
    if(micros() - start2 > 5000) break; // Timeout
  }
  unsigned long end2 = micros();
  
  // --- TEST PORT 1 (TMC) ---
  unsigned long start1 = micros();
  SerialTMC.print(payload);
  while(SerialTMC.available() < payload.length()) {
    if(micros() - start1 > 5000) break; // Timeout
  }
  unsigned long end1 = micros();

  // Clean up buffers
  while(Serial2.available()) Serial2.read();
  while(SerialTMC.available()) SerialTMC.read();

  // Display Results
  Serial.print("Port 2 (LiDAR) RTT: ");
  Serial.print(end2 - start2);
  Serial.print(" us | Port 1 (TMC) RTT: ");
  Serial.print(end1 - start1);
  Serial.println(" us");

  delay(4); // Run at ~100Hz
}