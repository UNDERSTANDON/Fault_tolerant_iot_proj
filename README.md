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

For phone/ESP32 hotspot testing, configure the Windows firewall from an
elevated PowerShell session. First identify the active hotspot interface:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Select-Object InterfaceAlias, IPAddress, PrefixLength
```

Preview the rules using the exact hotspot interface alias (the alias below is
the currently observed one; it may change):

```powershell
.\local_server\Configure-HotspotFirewall.ps1 `
  -HotspotInterfaceAlias "Local Area Connection* 2" `
  -ScopeDockerBackend `
  -WhatIf
```

If the preview shows the intended hotspot address and subnet, run the same
command without `-WhatIf` from elevated PowerShell. It creates hotspot-scoped
inbound rules for Vite HTTPS (TCP 5173), authenticated dashboard bridge WSS
(TCP 8081), and ESP32 MQTT/TLS (TCP 8883). It also narrows Docker Desktop's
inbound allowance to the selected hotspot address and subnet. That Docker
rule applies to every Docker-published port on this laptop; other Docker
workloads will also become hotspot-only. The original Docker rule address
scopes and edge-traversal policies are backed up outside the repository under
`%LOCALAPPDATA%\FaultTolerantIoT\firewall`.

Docker Desktop's existing inbound rules may use `DeferToUser` edge traversal,
which Windows does not permit together with an address restriction. The helper
changes that policy to `Block` before applying the hotspot address scope and
verifies each updated rule. The original edge-traversal policy is included in
the backup and restored by `-RestoreDockerBackend`.

Configure the local HTTPS dashboard and authenticated WSS bridge using the
same active interface:

```powershell
.\local_server\Configure-LanDashboard.ps1 `
  -HotspotInterfaceAlias "Local Area Connection* 2"
```

This verifies the local server certificate includes the hotspot IP and updates
ignored local environment files. The browser does not receive a reusable
bridge token. Instead, the dashboard uses an HttpOnly session cookie issued by
the local server. Install the public `ca.crt` on the phone as a trusted
certificate authority before opening `https://<hotspot-host-ip>:5173`; do not
bypass certificate warnings or copy the private server key to the phone. The CA
file is `%LOCALAPPDATA%\FaultTolerantIoT\mosquitto\certs\ca.crt`.

Before first login, create the administrator from a terminal on the laptop:

```powershell
cd .\local_server
npm run setup:admin
```

The command prompts for a username and hidden password, refuses to overwrite an
existing account file, and creates the first administrator locally. The server
does not expose administrator bootstrap over HTTP. The runtime does not ship a
default administrator account. Once signed in, administrators can create
visitor accounts and enable or disable them from **User accounts**; public
visitor registration is not available. Disabling a visitor revokes their active
sessions. Browser-session cookies have no persistent lifetime; the server
expires sessions after six hours by default. Browser session restore may retain
a session cookie after a restart.
The password is hashed in the account file and cannot be recovered from
`%LOCALAPPDATA%\FaultTolerantIoT\local-server\users.json`. If an existing
administrator password is unknown, the current implementation has no password
recovery flow; do not delete or edit the account file as a workaround.
Keep credentials outside source control and never paste them into screenshots
or logs.

Restart the two development processes after configuring them:

```powershell
cd .\main\web_hoster\web\react_app
npm run dev
```

```powershell
cd .\local_server
npm run dev
```

The Vite server and bridge bind to the current hotspot IP, not every host
interface. The bridge uses TLS, validates the HTTPS dashboard Origin, and only
forwards the allowlisted connectivity-test topic. Browser access is authorized
by the server-side session cookie; the bridge does not expose a shared browser
credential or require the browser to store a token. The browser connection does
not support device commands.

The dashboard reports bridge status and the last ESP32 connectivity-test
message; a test message becomes stale after 70 seconds. It does not update
simulated room readings or device state. Keep the hotspot active and verify
its IP/certificate SAN when it changes. Do not bind services to `0.0.0.0` as
an access workaround.
The hotspot-specific `.env` settings are for `npm run dev`; production
`npm run build` intentionally omits the local bridge URL so the laptop's
address is not embedded in the ESP32 web assets.

### 30-minute LAN stability test

Before starting, make sure the phone trusts the local CA. Start the HTTPS
dashboard and authenticated bridge as described above, connect the ESP32 to
the hotspot, and sign in on the phone with a local account. Keep the phone
dashboard visible during the run.

In a third PowerShell terminal, run:

```powershell
cd .\local_server
$env:LOCAL_AUTH_ADMIN_USERNAME = Read-Host "Administrator username"
$securePassword = Read-Host "Administrator password" -AsSecureString
$env:LOCAL_AUTH_ADMIN_PASSWORD = (New-Object System.Net.NetworkCredential('', $securePassword)).Password
npm run test:lan -- --duration-minutes 30
Remove-Item Env:\LOCAL_AUTH_ADMIN_USERNAME, Env:\LOCAL_AUTH_ADMIN_PASSWORD
```

The monitor verifies the dashboard HTTPS certificate against the local CA,
checks the HTTPS page every 10 seconds, opens an authenticated WSS client,
confirms a WebSocket handshake without a valid session is rejected, tracks
broker status and the bridge topic allowlist, tracks ESP32 connectivity-test
freshness, and reconnects its monitoring client if the bridge restarts. It
does not restart Docker or other services automatically. You may shorten a
trial with `--duration-minutes 1` or adjust sampling with
`--sample-seconds 5` (allowed range: 5-60 seconds).

Keep the phone on the dashboard and note the time if its connection visibly
drops or returns. For a recovery test, optionally restart only the bridge
mid-run and wait for both the monitor and phone dashboard to reconnect before
testing another component. Broker/Docker and hotspot restarts interrupt
services; do those only as separate, deliberate tests, one at a time. A
laptop restart cannot be monitored by a process running on that laptop.

The script writes a timestamped CSV and summary under
`%LOCALAPPDATA%\FaultTolerantIoT\test-runs`. The report contains health
states and counts, not passwords, session cookies, MQTT payload, or device
identifier.
`PASS` means no observed interruption during the run; a recovered outage is
reported separately and should be reviewed alongside the timestamps. This
laptop-side monitor cannot inspect the phone UI or prove that Android trusts
the CA, so retain a phone screenshot after the run. It tests only the
connectivity-test topic, not sensors or device commands.

To restore the saved Docker firewall scopes and remove the project rules,
run these commands from an elevated PowerShell session:

```powershell
.\local_server\Configure-HotspotFirewall.ps1 -RestoreDockerBackend
.\local_server\Configure-HotspotFirewall.ps1 -Remove
```

The ESP32 demo supports trusting the local CA through the custom-CA menuconfig
option above. Do not disable TLS certificate validation to work around a
certificate or hostname mismatch.

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
