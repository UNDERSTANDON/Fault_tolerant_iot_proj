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
5. Start the local MQTT broker and bridge (see below) if you want to test broker connectivity instead of relying only on the built-in dashboard simulation.
6. Monitor the device output, interrupt a relevant connection or service, and verify the firmware's behavior during failure and recovery.

## Local MQTT broker and LAN bridge

Initialize the local development broker from the repository root:

```powershell
.\local_server\Initialize-LocalBroker.ps1
```

By default, the broker's MQTT/TLS and WSS ports are bound to `127.0.0.1`
only. The script creates a local CA, broker certificate, topic-limited test
accounts, and a new `fault-tolerant-iot-mosquitto` container. Private keys
and generated credentials are kept under `%LOCALAPPDATA%\FaultTolerantIoT`,
outside the OneDrive repository. The previous stopped broker container and
its volumes are left untouched.

The initializer generates separate random passwords for the `esp32_test` and
`dashboard_bridge` accounts. For ESP32 setup, retrieve the `ESP32_MQTT_USERNAME`
and `ESP32_MQTT_PASSWORD` values from
`%LOCALAPPDATA%\FaultTolerantIoT\mosquitto\bridge.env`; do not commit this file
or paste the password into source code, a broker URI, or logs.

The default broker binding (`127.0.0.1`) is for laptop-only testing. To let an
ESP32 on the laptop hotspot connect, initialize the broker with the hotspot
host IP before creating it. For example, replace `192.168.137.1` with the
verified hotspot interface address:

```powershell
.\local_server\Initialize-LocalBroker.ps1 `
  -BrokerDnsName 192.168.137.1 `
  -BrokerIpAddress 192.168.137.1 `
  -BindAddress 192.168.137.1
```

The broker certificate must include the same address, and Windows firewall
access must be narrowly scoped to the hotspot network. The initializer refuses
to overwrite existing local broker configuration or credentials; do not delete
those files to change the binding without first reviewing and preserving them.

For ESP32 TLS configuration, copy the broker's public CA certificate into the
ignored firmware path:

```powershell
Copy-Item "$env:LOCALAPPDATA\FaultTolerantIoT\mosquitto\certs\ca.crt" `
  .\main\mqtt_connectivity\broker_ca.pem
```

Open `idf.py menuconfig`, then under **ESP32 MQTT connectivity demo** set the
broker URI to `mqtts://<hotspot-host-ip>:8883`, the MQTT username and password
to the `esp32_test` values from `bridge.env`, and enable **Trust a local MQTT
broker CA certificate**. Configure the Wi-Fi credentials there as well, then
build and flash the firmware. These build-time credentials are embedded in the
firmware image; keep `sdkconfig` local and rebuild/reflash if they change.
The custom-CA option defaults to disabled. Before building, verify it is
enabled in `sdkconfig`:

```powershell
Select-String .\sdkconfig -Pattern '^CONFIG_CONNECTIVITY_MQTT_USE_CUSTOM_CA=y$'
```

If this prints no match, reopen `idf.py menuconfig`, enable the option, save,
then build and flash again. Editing `sdkconfig` alone does not update firmware
already flashed to the ESP32.

Install the local service dependencies once, then verify certificate
validation, authentication, ACLs, and delivery:

```powershell
cd .\local_server
npm ci
node .\verify-broker.mjs
cd ..
docker compose --env-file .\local_server\.env -f .\local_server\docker-compose.yml ps
```

To connect the dashboard bridge on the same laptop, set
`VITE_LAN_BRIDGE_URL=ws://127.0.0.1:8081` in
`main/web_hoster/web/react_app/.env`, then run:

```powershell
cd .\local_server
npm run dev
```

The bridge reads its broker credentials from the external credentials file.
It only subscribes to the broker's allowed topics and does not provide
actuator commands. The browser does not receive broker credentials.

When `VITE_LAN_BRIDGE_URL` is configured, the dashboard reports the bridge's
broker connection and the last received ESP32 connectivity-test message. A
test message is marked stale after 70 seconds without another receipt. These
messages do not update room sensors or device state; those controls and values
remain simulated, and no device command or acknowledgement path is connected.

This default loopback setup is intentionally not reachable by the ESP32 or
other LAN clients. Hotspot access requires an active hotspot, a verified
hotspot interface address, a certificate SAN for that address, and a
reviewed Windows firewall rule. Do not bind to `0.0.0.0` as a workaround.

The React dashboard's simulation remains available unless the local bridge is
configured. A live broker test message is connectivity test data, not sensor
telemetry or reported device state.

To start the dashboard:

```powershell
cd .\main\web_hoster\web\react_app
npm run dev -- --host 0.0.0.0
```

The ESP32 demo supports trusting the local CA through the custom-CA menuconfig
option above. Do not disable TLS certificate validation to work around a
certificate or hostname mismatch.

For dashboard bridge setup, copy
`main/web_hoster/web/react_app/.env.example` to `.env` in that folder and set
`VITE_LAN_BRIDGE_URL=ws://127.0.0.1:8081`. The bridge runs with
`npm run dev` from `local_server`; it connects to Mosquitto over WSS with
certificate validation and uses the read-only bridge account.

The browser-facing bridge is loopback-only and currently intended for the
laptop browser, not cross-device use. It does not expose device commands or
provide persistent event delivery.

Do not treat simulated dashboard state or broker connectivity test traffic
as live sensor or device-state evidence.

## Hardware and configuration

Use the ESP32-S3 board and any peripherals specified by the firmware. Check the source and configuration files for pin assignments, dependencies, network settings, and supported fault-recovery behavior.

Configure the station Wi-Fi SSID/password, MQTT broker URI, and MQTT credentials in **ESP32 MQTT connectivity demo** using `idf.py menuconfig`. For the local broker, use the generated `esp32_test` username and password described above. These build-time values are embedded in the firmware image and are not secure provisioning. Keep the local `sdkconfig` out of source control; never put credentials in the broker URI, source code, or logs. Configure a fallback AP password there as well if the fallback access point is needed.

The MQTT test client starts only after station Wi-Fi receives an IP address. It publishes to `demo/esp32-mqtt-connectivity/test` immediately after connecting and every 30 seconds. The versioned test payload is `{"schema_version":1,"kind":"connectivity_test","device_id":"<station-mac>","sequence":1}`; it is test data, not sensor telemetry or device state. Publications use QoS 0, and a local client acceptance log is not proof of broker receipt. Verify delivery with an independent subscriber.

The local broker uses MQTT/TLS on port 8883 and WSS on port 8084. It is
loopback-bound by default and not reachable from the ESP32. Do not use
`localhost` from another device or assume the ESP32 fallback AP routes to the
host. Hotspot access requires an active hotspot, a verified interface
address, an appropriate certificate SAN, and a narrow Windows firewall rule.
Do not disable TLS validation or forward broker ports from the router.

The React web interface is embedded in the ESP32 firmware and served over HTTP
at `http://esp32-lan.local/` when the client is connected to the same network
and supports mDNS.

## Status

This overview is intentionally implementation-neutral. Update it with the project's exact hardware, setup commands, implemented fault-tolerance features, and test results as those details are established.
