# Fault-Tolerant IoT Project

An ESP32-based IoT project focused on maintaining reliable device operation when connectivity or a supporting service is interrupted. The project brings together embedded control, network communication, and fault-handling strategies.

## Project overview

The ESP32 serves as the device controller. It can collect data from connected hardware, communicate with configured network services, and respond to interruptions according to the firmware's recovery logic. The specific sensors, services, and recovery mechanisms depend on the implementation in this repository.

## Objectives

- Detect communication or service failures.
- Handle interruptions without leaving the device in an undefined state.
- Restore normal operation when the failed connection or service becomes available again.
- Make fault scenarios straightforward to test and observe.

## Getting started

1. Open the firmware in the development environment used by the project.
2. Install the ESP32 board support and libraries required by the source code.
3. Configure network credentials and any project-specific settings; do not commit private credentials.
4. Build and upload the firmware to an ESP32 board.
5. Monitor the device output, interrupt a relevant connection or service, and verify the firmware's behavior during failure and recovery.

## Hardware and configuration

Use the ESP32-S3 board and any peripherals specified by the firmware. Check the source and configuration files for pin assignments, dependencies, network settings, and supported fault-recovery behavior.

Configure the station Wi-Fi SSID/password, MQTT broker URI, and any MQTT credentials in **ESP32 MQTT connectivity demo** using `idf.py menuconfig`. These build-time values are embedded in the firmware image and are not secure provisioning. Keep the local `sdkconfig` out of source control; never put credentials in the broker URI, source code, or logs. Configure a fallback AP password there as well if the fallback access point is needed.

The MQTT test client starts only after station Wi-Fi receives an IP address. It publishes to `demo/esp32-mqtt-connectivity/test` immediately after connecting and every 30 seconds. The versioned test payload is `{"schema_version":1,"kind":"connectivity_test","device_id":"<station-mac>","sequence":1}`; it is test data, not sensor telemetry or device state. Publications use QoS 0, and a local client acceptance log is not proof of broker receipt. Verify delivery with an independent subscriber.

For a local Docker broker, configure a `mqtt://<broker-host-LAN-address>:1883` URI reachable from the ESP32's station network. Do not use `localhost` or assume the ESP32 fallback AP routes to the host. Plaintext MQTT is suitable only for an isolated demo network; use `mqtts://` with the ESP-TLS certificate bundle for TLS. Do not send credentials over plaintext MQTT.

The React web interface is embedded in the ESP32 firmware and served over HTTP
at `http://esp32-lan.local/` when the client is connected to the same network
and supports mDNS.

## Status

This overview is intentionally implementation-neutral. Update it with the project's exact hardware, setup commands, implemented fault-tolerance features, and test results as those details are established.
