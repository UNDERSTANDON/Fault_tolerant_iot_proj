# Local controller network and GPIO validation

## Implemented behavior

- The ESP32 attempts station Wi-Fi up to three times at startup. Missing or
  invalid station settings, or exhausted attempts, lead to a secured fallback
  AP attempt at `192.168.4.1`.
- After station loss, the fallback AP is started/retained while station
  reconnects retry with 5, 10, 20, then 30 second delays, repeating at
  30 seconds. The current policy retains the AP after station recovery.
- The HTTP endpoint `GET /api/network/status` reports station and AP status.
  The embedded dashboard polls it and labels this firmware status separately
  from simulated dashboard data.
- Fallback AP configuration requires a 1-32 byte SSID and an 8-63 byte
  password. Invalid/empty passwords are rejected; an open AP is not started.
- GPIO roles `SENSOR_INPUT_1` and `LIGHT_RELAY_1` default to unassigned
  (`-1`). No GPIO driver or hardware behavior was added.

## Build and automated checks

- ESP-IDF 6.1 `idf.py build`: passed for ESP32-S3. The final firmware build
  embedded the generated React assets.
- GPIO CMake validation: all five cases passed: both roles unassigned, valid
  ESP32-S3 pins, invalid GPIO 22, duplicate pins, and assignments on a
  non-ESP32-S3 target.
- Native `local_controller` transition test: passed using MinGW `g++` with
  `-Wall -Wextra -Werror`.
- React `npm run build`: passed. Vite emitted existing warnings about the
  output directory being inside the project root and overlapping the public
  directory.
- React `npm run lint`: unavailable because this project has no
  `eslint.config.*`; installed ESLint 10 does not load a legacy config by
  default. No lint configuration migration was made as part of this change.
- `git diff --check`: passed after normalizing the generated embedded HTML.

## User-provided device log

The serial log at `specs/log_evidence/controller_evidence/esp.log` verifies
that the device started the fallback AP after three failed station attempts,
assigned a client a DHCP lease, kept AP+STA mode while retrying, and later
obtained a station IP. The firmware reported `station_ap_recovery`, and the
MQTT client connected after station recovery. At the end, the AP interface
still appears active; an associated client leaves, but the log does not show
the AP shutting down.

This log does not establish that the AP client can reach the embedded
dashboard after recovery or access the Internet through the ESP32. The current
firmware does not enable IP forwarding/NAPT, so the fallback AP is local-only;
station recovery does not share the station connection with AP clients.
Configure a unique 8-63 character fallback password in `idf.py menuconfig`
before testing AP access.

## Still unverified

Dashboard access from an AP client, end-to-end Internet access, and sustained
AP-client behavior after station recovery still need client-side testing.

GPIO assignments remain intentionally untested and unconfigured because board
revision, reserved pins, wiring, and attached electrical interfaces are not
confirmed. AP-only operation does not establish access to a laptop, Docker,
MQTT broker, Internet, cloud, or physical device controls.
