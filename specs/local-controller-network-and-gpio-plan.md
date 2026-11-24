# Plan: Local Controller Network Recovery and GPIO Configuration

## Status

Planning document. No implementation changes are included in this stage entry.

## Goal

Establish reliable local access when the configured Wi-Fi hotspot/router is
unavailable, including loss after the ESP32 has already connected. Add a
central ESP-IDF Kconfig-based GPIO mapping so pin assignments can be supplied
later without scattering pin numbers through implementation code.

This plan does not select physical GPIO assignments, sensors, actuators, or
electrical interfaces. Do not enable hardware behavior until those details and
a safe test method have been reviewed.

## Current implementation findings

- `main/local_controller/local_controller.cpp` is a stub. Its header declares
  status-task methods but there is no controller behavior yet.
- Wi-Fi setup, fallback AP startup, HTTP hosting, mDNS, and station reconnect
  currently live in `main/web_hoster/web_hoster.cpp`.
- On startup, `start_local_network()` loads station Wi-Fi settings. If the SSID
  is empty or invalid, `get_wifi_config()` fails and the function returns
  before attempting the fallback AP.
- If a configured station network fails initial connection attempts, startup
  attempts to start the fallback AP at `192.168.4.1`.
- After a successful station connection later drops, the reconnect task
  retries station Wi-Fi but does not create/start the fallback AP if it was
  not already active. This matches the reported runtime hotspot-loss symptom.
- When a fallback AP already exists, station reconnection uses AP+STA mode.
  The eventual behavior when station service returns, including whether the
  AP remains active or is shut down, needs an explicit policy and testing.
- The HTTP server serves embedded static assets. Do not assume that clients on
  the ESP32 fallback AP can reach the laptop-hosted Docker broker, Node bridge,
  or dashboard.
- Current Wi-Fi and fallback AP settings are ESP-IDF Kconfig values in
  `main/Kconfig.projbuild`; there is no GPIO mapping configuration yet.
- The target board recorded in `ESP_specs.txt` is ESP32-S3-N16R8, but the
  complete board revision, wiring, and available GPIO layout are not
  established by that target name alone.

## Scope

### Included

- Define network-state ownership between `local_controller` and `web_hoster`.
- Handle fallback AP operation when station Wi-Fi is absent at boot, missing
  from configuration, or lost after a previously successful connection.
- Continue bounded station reconnect attempts while maintaining local access.
- Define station recovery behavior and observable network state transitions.
- Keep the embedded HTTP dashboard available to clients connected directly to
  the ESP32 fallback AP.
- Add centralized, build-time GPIO role configuration using ESP-IDF Kconfig.
- Keep unassigned GPIO roles disabled and reject invalid or conflicting
  mappings before any hardware initialization.
- Add verification procedures for startup, outage, recovery, local access,
  and GPIO configuration validation.

### Deferred

- Assigning real GPIO numbers or asserting physical wiring.
- Sensor sampling, relay/actuator control, and production telemetry.
- Hardware safety logic or claims that the system replaces certified
  protection/alarm equipment.
- Routing the ESP32 fallback AP to the laptop, Docker, the Internet, or cloud
  services.
- Runtime editing of GPIO mappings through a web UI or JSON file.
- Production provisioning, captive portal, or cloud-managed configuration.

## Proposed architecture

- `web_hoster` remains the ESP-IDF Wi-Fi/HTTP/mDNS adapter: it performs
  ESP-IDF network operations and reports events/results.
- `local_controller` owns application-level network policy and state
  transitions: startup choice, fallback availability, retry/backoff policy,
  and station recovery decisions. Avoid a second Wi-Fi event/state machine
  that competes with `web_hoster`.
- Define explicit states, at minimum: initializing, station connecting,
  station connected, fallback AP active, station+AP recovery, and unavailable.
  State must reflect observed ESP-IDF events, not merely requested operations.
- On loss of station connectivity, activate or retain the secured fallback AP
  and continue bounded station retries. Ensure the fallback web interface is
  reachable without a laptop or broker.
- When station connectivity returns, update status and apply the reviewed AP
  recovery policy. Do not tear down the fallback path before the station path
  is confirmed usable.
- The embedded UI and controller must report local, station, broker, and
  simulated states distinctly. AP operation alone must not be reported as
  Docker/broker connectivity.

## GPIO configuration approach

- Use ESP-IDF Kconfig options in `main/Kconfig.projbuild` as the single
  build-time configuration source, consistent with existing network settings.
  Do not add a runtime JSON mapping in this stage.
- Define stable role names (for example, `LIGHT_RELAY_1` or `SENSOR_INPUT_1`)
  only when their intended interface is known. Keep roles unassigned by
  default; an unassigned role means the associated feature is disabled.
- Keep pin use out of device logic: code consumes a centralized typed
  configuration/mapping rather than embedding GPIO numbers at call sites.
- Before enabling a configured role, validate the target is ESP32-S3, the pin
  is within the board-supported set, and no two exclusive outputs conflict.
  Board-specific reserved or unsuitable pins must be documented before any
  actual mapping is accepted. Do not infer this set from the chip model alone.
- Configuration changes are compile-time and require rebuilding/flashing. If
  the user later needs field/runtime remapping, plan that as a separate
  configuration and security decision.
- Keep GPIO defaults safe and inactive: no output toggles or actuator
  initialization occurs for an unassigned role.

## Implementation and verification steps

1. **Confirm network and fallback requirements**
   - Record the exact observed failure cases: no hotspot at boot, missing
     station SSID, hotspot loss after successful connection, and station
     recovery.
   - Decide whether the fallback AP stays active permanently after station
     recovery or is stopped only after a defined stable interval.
   - Confirm fallback AP SSID/password requirements and make startup failures
     explicit. Never start an open fallback AP as an error recovery shortcut.
   - Confirm the user-facing local URL/IP and the functionality expected when
     only the ESP32 AP is available.

2. **Define controller/adapter contract**
   - Specify network states, events, transitions, retry/backoff behavior,
     duplicate-event handling, and failure reporting.
   - Keep ESP-IDF Wi-Fi and interface operations in `web_hoster`; have it
     notify the controller of actual connection/AP events and return operation
     errors.
   - Ensure repeated start/stop/reconnect events do not create duplicate AP
     interfaces, tasks, event handlers, DHCP servers, or HTTP servers.
   - Define how HTTP/mDNS services behave across STA, AP, and AP+STA modes.

3. **Implement and test network recovery**
   - Start a secured fallback AP when station credentials are absent or
     station connection cannot be established.
   - Start/retain the fallback AP when station connectivity is lost after
     startup while station reconnection continues with bounded delays.
   - Confirm a client can associate, receive DHCP configuration, and load the
     embedded dashboard during AP-only operation.
   - Restore station connectivity and verify the chosen AP lifecycle policy,
     IP/service reporting, and continued local availability.
   - Log explicit failure causes for AP configuration/start, DHCP, reconnect
     task creation, and server startup. Do not report a successful fallback
     if any required component failed.

4. **Add central GPIO Kconfig mapping**
   - Define the first set of logical GPIO roles without assigning physical
     pins unless board wiring is confirmed.
   - Provide unassigned defaults and typed accessors/config data for firmware
     components.
   - Validate unsupported pins, conflicts, and unconfigured roles before
     initialization; fail explicitly or leave the dependent feature disabled
     according to the agreed policy.
   - Do not configure or drive any physical output in this planning stage.

5. **Verify and record**
   - Build with all GPIO roles unassigned and confirm networking/dashboard
     still operate.
   - Test invalid and conflicting GPIO configuration in build-time or
     validation tests; verify unassigned roles never initialize hardware.
   - On hardware, capture serial logs for boot without hotspot, boot with
     missing station configuration, hotspot loss after association, fallback
     client access, station recovery, and fallback AP startup failure.
   - Measure fallback activation and reconnect behavior against thresholds
     agreed before implementation; do not invent subsecond guarantees.
   - Verify AP access is password-protected and does not imply access to the
     laptop broker/Internet.
   - Stop for user review and a separate commit before adding hardware drivers
     or assigning real pins.

## Acceptance criteria

- The fallback AP works when station Wi-Fi cannot be reached at boot and when
  it is lost after a successful connection.
- An associated client gets an address and can load the embedded local
  dashboard while the station network is unavailable.
- Station reconnection is bounded, observable, and does not make the AP
  unavailable prematurely.
- Recovery behavior for keeping/stopping the AP is explicit, tested, and
  reflected accurately in status.
- No empty/invalid AP password silently produces an open network.
- `local_controller` owns policy and `web_hoster` performs network operations
  without competing state machines or duplicate resources.
- GPIO roles are centralized in Kconfig, default to unassigned, and do not
  enable hardware until a reviewed mapping exists.
- Invalid/conflicting mappings are detected before hardware use; no physical
  pins are guessed or hard-coded.
- No broker, Internet, sensor, actuator, or safety behavior is claimed unless
  independently verified.
- The user reviews the test evidence and independently commits this stage.

## Open decisions before implementation

- After station recovery, should the ESP32 keep the fallback AP active, or
  stop it only after station connectivity has remained stable for a chosen
  interval?
- What should the local dashboard support in AP-only mode, given the laptop
  bridge and Docker broker are not assumed reachable?
- What are the acceptable measured fallback activation and station reconnect
  thresholds?
- Which logical GPIO roles should be declared now, before physical assignments
  are known?
- What board-revision-specific GPIO set and conflict policy will be used once
  the physical layout is available?
- Should invalid/unassigned GPIO configuration disable only the affected
  feature or prevent firmware startup? Do not enable safety-relevant hardware
  by default.
