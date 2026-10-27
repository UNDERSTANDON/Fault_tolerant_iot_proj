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

Use the ESP32 board and any peripherals specified by the firmware. Check the source and configuration files for pin assignments, dependencies, network settings, and supported fault-recovery behavior.

Wi-Fi credentials are read from `main/web_hoster/wifi_config.json` and embedded in the firmware at build time. Replace the placeholder values before building. Do not commit real credentials; anyone with the firmware image may be able to extract them.

The firmware embeds the built web assets (`index.html`, `style.css`, and `app.js`), not the React source tree. The ESP32-S3-N16R8 has 16 MB of flash; this project uses ESP-IDF's 1.5 MB single-app partition layout, which does not support OTA updates.

The web interface is served over HTTP at `http://esp32-lan.local/`.

If the configured house Wi-Fi is unavailable at startup, the ESP32 starts its fallback access point and keeps retrying the house network in a background task. On fallback, it uses AP+STA mode so clients can keep using the local web interface while the station reconnects.

## Status

This overview is intentionally implementation-neutral. Update it with the project's exact hardware, setup commands, implemented fault-tolerance features, and test results as those details are established.
