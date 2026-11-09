# Stage: ESP32 MQTT Connectivity

## Status

Current status: Completed for the tested Docker broker and Wi-Fi network.

The firmware is flashed. A broker interruption and recovery were captured
with Wi-Fi remaining connected during the tested interruption. The ESP32
reconnected and an independent subscriber received the subsequent test
publication. See the paired logs under `specs/log_evidence`.

## Goal

Demonstrate that the ESP32 can connect to the selected MQTT broker, publish a
small test message, recover after a broker/network interruption, and report
the outcome clearly. This stage validates the ESP-to-broker path only; it is
not the complete smart-home integration.

## Starting assumptions

- The target is the ESP32-S3 project built with ESP-IDF.
- For the demo, Wi-Fi settings and the broker URI will be provided through
  ESP-IDF configuration rather than a web provisioning flow.
- The MQTT broker is reachable from the network interface used by the ESP32.
  The ESP32's hosted AP is not assumed to bridge clients to the broker or the
  local server's hotspot.
- Hardware sensors, actuators, dashboard behavior, and cloud services are not
  prerequisites for this stage.

## Scope

### Included

- Select and add an ESP-IDF-compatible MQTT client component.
- Configure the Wi-Fi network and MQTT broker endpoint without committing
  credential values.
- Connect the ESP32 to the broker and publish a versioned test message.
- Log connection, publication, disconnection, and reconnection outcomes.
- Retry after an interruption without blocking the firmware's other work.
- Verify broker receipt with an independent MQTT subscriber.

### Deferred

- Sensor sampling or sensor-derived telemetry.
- LED, fan, servo, or other actuator control.
- Dashboard, browser MQTT, ESP32 HTTP/WebSocket APIs, and local-server
  integration.
- Firebase or other cloud synchronization.
- Persistent event queues, six-hour retention, replay, or queue clearing.
- Production provisioning, production credential management, and claims of
  secure remote access.

## Implementation steps

1. **Confirm the test network and broker**
   - Choose a broker endpoint reachable from the ESP32's Wi-Fi connection.
   - Confirm the broker's listener, port, authentication requirements, and
     whether the demo uses plaintext MQTT or TLS.
   - From a separate test client on the same reachable network, verify that
     the broker accepts a connection and that a subscriber can observe a
     test topic.
   - Record the network path used for the test. Do not assume the ESP32 AP
     provides routing to the broker.

2. **Add MQTT configuration and dependency**
   - Check the project's ESP-IDF version and select a compatible MQTT client
     component.
   - Add the dependency and firmware component requirement using the project's
     ESP-IDF Component Manager/CMake conventions.
   - Add configuration entries for the broker URI and any required
     credentials. Keep secret values out of source control and build logs.
   - Document that build-time configuration is suitable for the demo but is
     not equivalent to secure runtime provisioning; firmware images may
     expose embedded settings.

3. **Implement a small MQTT connection lifecycle**
   - Start the MQTT client only after Wi-Fi has a usable network connection.
   - Track and log connection state and relevant failure reasons.
   - Handle broker disconnects and reconnect using bounded retry/backoff
     behavior; do not spin in a tight retry loop or block unrelated firmware
     work.
   - Ensure repeated start/stop or reconnect events do not create duplicate
     clients or event handlers.

4. **Publish a test message**
   - Define a stage-specific topic and a minimal versioned JSON payload before
     implementation. It must be clearly identified as test data, not a sensor
     reading or device state.
   - Publish on successful connection and at a modest, documented interval
     while connected.
   - Log the publish result. Do not treat local enqueue/acceptance by the
     client library as proof that the broker or subscriber received it.

5. **Exercise recovery**
   - Stop or disconnect the broker while the ESP32 is running.
   - Confirm the ESP32 reports disconnection and remains responsive.
   - Restore the broker/network and confirm the client reconnects and a
     subsequent test message is received.
   - Confirm that reconnect does not replay a persistent backlog: durable
     queuing and replay are outside this stage.

6. **Record results and boundaries**
   - Record the ESP-IDF/component versions, network path, broker mode
     (plaintext or TLS), test topic/schema, and observed outcomes.
   - Keep test logs free of credentials.
   - List any failures as unresolved rather than marking the stage complete
     based only on a successful initial connection.

## Acceptance criteria

- The firmware builds with the selected MQTT component.
- With valid network and broker settings, the ESP32 connects and an
  independent subscriber receives the documented test payload.
- With an invalid/unavailable broker, the firmware reports a failure and
  continues running without a tight retry loop.
- After broker interruption and restoration, the ESP32 reconnects and a new
  payload is received without a manual firmware restart.
- The test passes without sensors, actuators, dashboard, or cloud services.
- No credential values are committed or printed in logs.

## Decisions recorded for implementation

- The ESP32 joins the configured station Wi-Fi. For this test, it must be a
  network that routes to the Docker host's LAN address; the ESP32 fallback AP
  is not assumed to provide that route. The SSID and credentials remain
  machine-local ESP-IDF configuration.
- Configure the broker as `mqtt://<host-LAN-address>:1883` for the currently
  running Docker demo listener. That listener is plaintext and anonymous;
  this choice is limited to an isolated demo network. `mqtts://` uses the
  ESP-TLS certificate bundle. Credentials are rejected for plaintext URIs.
- ESP-IDF 6.1.0 and Espressif MQTT managed component 1.1.0.
- Topic, schema, interval, QoS, and retry policy are as listed in the
  implementation decisions below.

## Implementation decisions and current test evidence

- Firmware target: ESP32-S3; the configured build uses ESP-IDF 6.1.0.
- MQTT dependency: Espressif `mqtt` managed component, pinned to version
  `1.1.0` (resolved by ESP-IDF 6.1.0's Component Manager).
- Wi-Fi SSID/password, broker URI, and optional MQTT username/password are
  ESP-IDF configuration values. They are compiled into the firmware image;
  this is demo configuration, not secure provisioning. The fallback AP also
  requires a configured password and does not start with an empty/invalid one.
- Current Docker demo listener: host port 1883, plaintext MQTT, anonymous
  access. The ESP is configured to connect to
  `mqtt://192.168.137.1:1883`, the host's current LAN/hotspot interface
  address published to Docker. The Windows-local Mosquitto process listens
  only on loopback (`127.0.0.1`/`::1`); a subscriber pointed at
  `127.0.0.1:1883` observes that separate broker, not the ESP's Docker broker.
  An independent host subscriber pointed at `192.168.137.1:1883` connected to
  Docker and received an ESP test publication; see
  [esp32-docker-broker-subscriber-2026-11-09.txt](log_evidence/esp32-docker-broker-subscriber-2026-11-09.txt).
  This listener is for an isolated demo only; authentication and TLS must be
  configured before using a broker on an untrusted network. The ESP32 must
  join a station network that can route to the Docker host's LAN address;
  the ESP32 fallback AP is not a broker route.
- Topic: `demo/esp32-mqtt-connectivity/test`.
- Payload: `{"schema_version":1,"kind":"connectivity_test","device_id":"<12 lowercase station-MAC hex characters>","sequence":1}`. Sequence increments in RAM and resets after reboot.
- Publish interval: immediately after MQTT connection and every 30 seconds.
  QoS: 0, with no durable outbox/replay. Firmware logs distinguish local
  client acceptance from broker receipt; external subscriber observation is
  required to verify delivery.
- Retry: ESP-MQTT automatic reconnect with a 10-second reconnect interval;
  a 3-second network timeout bounds individual publish calls. Firmware
  publishes from a dedicated task so this demo path does not block the Wi-Fi
  event handler or other application tasks.
- Verified so far: the firmware builds with the managed MQTT dependency, and
  an independent host subscriber connected to the same Docker-published
  address as the ESP (`192.168.137.1:1883`) received device
  `14c19f3bd6a8`, sequence 79. This is ordinary live delivery, not
  post-interruption evidence. See
  [esp32-docker-broker-subscriber-2026-11-09.txt](log_evidence/esp32-docker-broker-subscriber-2026-11-09.txt).
  A paired post-Wi-Fi-recovery sample was captured at
  08:51:30 local time; see
  [esp32-mqtt-recovery-serial-live-2026-11-09.txt](log_evidence/esp32-mqtt-recovery-serial-live-2026-11-09.txt)
  and
  [esp32-mqtt-post-reconnect-subscriber-2026-11-09.txt](log_evidence/esp32-mqtt-post-reconnect-subscriber-2026-11-09.txt).
  Earlier serial evidence in
  [esp32-mqtt-serial-log.txt](log_evidence/esp32-mqtt-serial-log.txt) records
  Wi-Fi disconnect at 08:42:20, station IP recovery at 08:42:51, and MQTT
  reconnection at 08:43:00.
  The broker-outage serial capture
  [esp32-broker-outage-serial.txt](log_evidence/esp32-broker-outage-serial.txt)
  and independent host subscriber capture
  [esp32-broker-outage-subscriber-live-2026-11-09.txt](log_evidence/esp32-broker-outage-subscriber-live-2026-11-09.txt)
  provide paired broker-interruption evidence. Subscriber timestamps are UTC
  and converted here to local time. At 10:10:22, the subscriber went offline;
  it received `ECONNREFUSED` from the configured Docker host endpoint at
  10:10:26, then reconnected and resubscribed at 10:10:30.
  The ESP serial log records MQTT disconnection at 10:10:23 and MQTT
  reconnection plus local publish acceptance at 10:10:33. At 10:10:33, the
  independent subscriber received the ESP test payload with device ID
  `14c19f3bd6a8` and sequence 4. No Wi-Fi disconnect is reported during this
  interruption, so the trace demonstrates broker-endpoint recovery without
  the Wi-Fi-loss confound.
  A second interruption is also visible at 10:12:00-10:12:10: the subscriber
  reconnected and received sequence 7 after the ESP's reconnect. A separate
  Wi-Fi disconnect starts later at 10:12:31; events after that time are not
  counted as broker-only recovery evidence.
  An earlier attempt
  [esp32-broker-outage-subscriber.txt](log_evidence/esp32-broker-outage-subscriber.txt)
  was run inside the broker container and also cannot provide post-recovery
  evidence because stopping that container stops its subscriber.
  The earlier standalone publication capture
  [esp32-mqtt-subscriber-log-2026-11-09.txt](log_evidence/esp32-mqtt-subscriber-log-2026-11-09.txt)
  is sequence 31 and is not the paired recovery sample. The Docker log
  [docker-logs-2026-11-09T00-45-36.431Z.csv](log_evidence/docker-logs-2026-11-09T00-45-36.431Z.csv)
  is separate connection evidence and shows the broker accepting connections
  from `ESP32_3bD6A8`. Mosquitto's info-level log does not include published
  payloads; use the subscriber capture for delivery evidence.

## Exporting ESP32 serial evidence

The ESP-IDF monitor environment is available through the project's
`idf_run.ps1` helper. In that ESP-IDF PowerShell terminal, connect the ESP32
over USB, find its COM port in Device Manager under **Ports (COM & LPT)**, and
run the following from the repository root (replace `COM7` if needed):

```powershell
idf.py -p COM7 monitor --no-reset --timestamps | Tee-Object -FilePath specs\log_evidence\esp32-mqtt-serial-log.txt
```

`--no-reset` attaches to the running firmware without toggling reset lines.
If the command reports that the port is busy or access is denied, close any
other serial monitor or serial terminal using that COM port, then run it again.
Leave the monitor open long enough to capture an MQTT connection and at least
one publication (the firmware publishes every 30 seconds), then press
**Ctrl+]** to exit and flush the text log. Keep credentials out of the
evidence; do not capture build/configuration output that prints secret values.
Because QoS 0 serial logs only show local acceptance, run an independent
subscriber during the serial capture and save its received payload too.

Do not run the subscriber via `docker exec` when stopping the broker: that
ties the subscriber process to the broker container, so it exits along with
the container. To keep the independent subscriber alive on the Windows host
and reconnect it when Mosquitto returns, run this from the repository root in
a normal PowerShell terminal. It uses the MQTT package already installed with
the React app, connects to the same Docker-published host address as the
ESP, and writes its log to the evidence folder. Replace the IP with the
broker host address configured in the ESP if it changes:

```powershell
Push-Location main\web_hoster\web\react_app
@'
const mqtt = require('mqtt');
const topic = 'demo/esp32-mqtt-connectivity/test';
const client = mqtt.connect('mqtt://192.168.137.1:1883', {
  clientId: 'recovery-evidence-' + Date.now(),
  reconnectPeriod: 2000,
  connectTimeout: 5000
});
const log = (...parts) => console.log(new Date().toISOString(), ...parts);
client.on('connect', () => {
  log('CONNECTED');
  client.subscribe(topic, { qos: 0 }, error => {
    if (error) log('SUBSCRIBE_ERROR', error.message);
    else log('SUBSCRIBED', topic);
  });
});
client.on('reconnect', () => log('RECONNECTING'));
client.on('offline', () => log('OFFLINE'));
client.on('close', () => log('CLOSED'));
client.on('error', error => log('ERROR', error.message));
client.on('message', (receivedTopic, payload) =>
  log('RECEIVED', receivedTopic, payload.toString()));
'@ | node - | Tee-Object -FilePath ..\..\..\..\specs\log_evidence\esp32-broker-outage-subscriber-live-2026-11-09.txt
Pop-Location
```

Start this subscriber while the broker is running and wait for `SUBSCRIBED`
before stopping the broker container. It should log `OFFLINE`/`RECONNECTING`
during the outage, then `CONNECTED`/`SUBSCRIBED` after Mosquitto returns.
Leave both it and the ESP32 serial monitor running; save a `RECEIVED` line
after reconnection and compare its device ID and sequence with the ESP
publication. This latest required sequence is currently missing from the
evidence.

## Completion boundary

Passing this stage proves only that the ESP32 can establish an MQTT connection
and exchange the defined test publication under the tested network conditions.
It does not prove sensor telemetry, command control, offline event retention,
AP-to-LAN routing, dashboard integration, cloud delivery, or production
security.
