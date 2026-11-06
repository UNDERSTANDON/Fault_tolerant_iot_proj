# Fault-tolerant IoT system requirements

## 1. Purpose

Build a user-controlled smart-home system that keeps its core functions
available on the local network when internet access or cloud services fail.
The ESP32-S3 is the device gateway and local controller. A separate local
server (such as a Raspberry Pi) hosts the dashboard and supporting services.
Cloud services support data storage, analysis, and remote notifications; they
are not required for local device control.

These are target requirements, not a claim that the features are implemented.
See [core_architecture_document.md](core_architecture_document.md) for the
planned components and operation flows.

## 2. First-release scope

### Included

- ESP32-S3 device gateway that samples confirmed attached sensors and exposes
  a local API for device status and commands.
- Separate local server for the browser dashboard and supporting services.
- Sensor telemetry published by the ESP32-S3 to the local Mosquitto broker and
  made available to the dashboard through the local server.
- Local network connection, documented fallback access, and recovery.
- Lighting as the first controllable device class. Only devices with confirmed
  hardware interfaces may be reported as controllable.
- Local event capture and status reporting.
- Mosquitto as the planned local MQTT broker, hosted on the local server in
  Docker.
- Firebase as the planned cloud destination for event logs and later analysis.

### Deferred

- Fan control and automatic door/NFC lock control.
- AI-based hazard prediction, automatic actions, and a mobile application.
- Specific sensor types and any smoke, heat, humidity, circuit-breaker,
  room-power, mains-power, or UPS monitoring until sensors, interfaces, and
  safe test methods are confirmed.
- Any claim that the system replaces certified electrical protection,
  alarms, or other safety equipment.

## 3. Core operating requirements

1. **Local authority:** With the local server available, a user on the LAN can
   use its dashboard to view status and control supported lighting without
   internet or Firebase. The ESP32 exposes the device API on the LAN; loss of
   the dashboard host may remove the normal UI, but must not make the ESP32's
   device control depend on cloud services. “80/20” is a design intention,
   not a measurable control ratio.
2. **No cloud lock-out:** Cloud failure must not disable local dashboard
   access, commands, or event capture while the local server and LAN remain
   available.
3. **Truthful status:** The dashboard distinguishes reported device state
   from requested state, command acknowledgement, stale data, and unavailable
   services. Sensor readings show their source and freshness. Unsupported or
   simulated devices and readings must not appear as real hardware data.
4. **Safe scope:** No actuator is enabled until its specific hardware,
   electrical interface, initialization state, and failure behavior are
   reviewed. Firmware status is not evidence that a protective device has
   operated.
5. **Explicit failures:** Network, broker, cloud, command, and storage failures
   are observable. A failed operation must not be presented as successful.

## 4. Event and cloud requirements

Events have three priorities:

- **Normal:** Batch and attempt cloud upload every 10 minutes.
- **Warning:** Record locally, make the warning visible on the local dashboard,
  and attempt cloud sync without waiting for the normal batch.
- **Critical:** Record locally with priority, make it visible on the local
  dashboard, and attempt cloud sync as soon as possible.

If a warning or critical event cannot be uploaded, retain it for retry. A
remote notification cannot be guaranteed while internet or cloud access is
unavailable; local visibility and durable event capture are the first
requirements. Retries must not block local control. Event IDs and cloud
acknowledgements must prevent retries from being mistaken for new events.

Firebase is the target for log storage. Periodic analysis and remote
notifications are later cloud functions; they must not issue actuator
commands in the first release.

## 5. Decisions required before implementation

The following details must be recorded in the architecture or phase specs
before the affected feature is implemented:

- Exact ESP32-S3 board revision, lighting hardware, pins, electrical
  isolation, and safe bench-test method.
- Wi-Fi provisioning, fallback access control, and behavior when the router
  fails after startup.
- Local server deployment, service startup/recovery, and behavior when the
  server or its Docker services are unavailable.
- Local API schema, command acknowledgement levels, and command timeout.
- Sensor sampling intervals, units, validation, and stale-data thresholds.
- MQTT topics, payload version, dashboard delivery method, authentication,
  and behavior when the broker is unavailable.
- Whether a Docker-hosted bridge will forward MQTT events to Firebase, and
  its authentication and credential-storage model.
- Persistent event-queue capacity, retention, flash wear, and overflow policy.
- Firebase products, security rules, retention, free-plan limits, and
  notification channel.
- Measured thresholds for network fallback, stale status, and event delivery.

Do not fill these gaps by inferring hardware wiring or by treating dashboard
simulation as device evidence.
