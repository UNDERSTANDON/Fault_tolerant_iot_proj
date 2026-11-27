# Plan: Local Server Event Delivery to Cloud Firestore

## Status

Implementation remains in progress, ahead of further AP+STA work and physical
GPIO assignment. The local emulator test passed on 2026-11-26, and the live
test-project MQTT-to-Firestore integration passed on 2026-11-27, including
readback, exact replay, and temporary-document cleanup. A fresh physical ESP32
run on 2026-11-27 generated four synthetic events; the exact four event IDs
were read back from the test Firestore project with matching device, run,
sequence, and synthetic markers. Production event delivery remains
unimplemented. Store evidence under
`specs/log_evidence/firebase_cloud_delivery/`.

### Current implementation status

The isolated synthetic-notification test path has been verified against a
live Firebase test project using both an authenticated MQTT test client and
the opt-in physical ESP32 publisher. The latest hardware log records four
bounded warning/critical publishes; all four corresponding Firestore
documents were verified by read-only lookup. It is separate from production
event delivery, which remains unimplemented. Current test contract:
`test/esp32/notifications/v1`, Firestore collection
`testEventNotifications`, synthetic source `esp32_mock`, event IDs
`<12-hex-device-id>-<16-hex-run-id>-<sequence>`, and device-uptime
timestamps. The opt-in firmware publisher is disabled by default and emits
four bounded Warning/Critical notifications at 60-second intervals.

The local server stores test events before MQTT acknowledgement, uses a
500-entry outbox, retries transient Firestore failures with backoff capped at
five minutes, and quarantines classified permanent failures. These are
initial test-path policies, not production warning/critical retention
decisions. Admin status is available from the authenticated local API; no
dashboard event feed is implemented. A loopback-only Firestore emulator mode
supports local smoke tests without cloud credentials. Its smoke test
confirmed the worker writes the event, reads back the Firestore document,
recognizes an exact replay as a duplicate, and clears the local outbox only
after confirmation. See
`specs/log_evidence/firebase_cloud_delivery/firestore-emulator-write-2026-11-26.txt`.
The live test-project verification is recorded in
`specs/log_evidence/firebase_cloud_delivery/live-cloud-mqtt-delivery-2026-11-27.txt`.
The physical-device run and document readback are recorded in
`specs/log_evidence/firebase_cloud_delivery/esp32-live-cloud-delivery-2026-11-27.txt`.

An initial broker check incorrectly treated a successful QoS 1 SUBACK as
proof that a write-only identity could read messages. The active broker may
acknowledge a subscription while its ACL filters message delivery. The
verifier now uses separate subscriber and publisher connections and checks
actual delivery. After the user-authorized Mosquitto restart, all eight broker
checks passed, including denial of message delivery to write-only identities
and delivery between the authenticated MQTT/TLS publisher and WSS subscriber.
Historical setup checks and the correction are documented in
`specs/log_evidence/firebase_cloud_delivery/broker-acl-2026-11-26.txt` and
`specs/log_evidence/firebase_cloud_delivery/cloud-test-readiness-2026-11-27.txt`.

## Goal

Forward approved, versioned events from the local MQTT broker to Cloud
Firestore using a local Docker/server-side bridge. Preserve local operation
when the Internet or Firebase is unavailable, retry pending cloud writes
without duplicating events, and keep cloud delivery outside the ESP32's local
control path. Include an opt-in ESP32 test publisher that generates clearly
identified mock events and sends them through the same local MQTT, bridge,
outbox, and isolated Firestore test path. Do not import or initialize the
provided Firebase web-app configuration as part of this planning stage.

The ESP32 `main/event_notifier` component routes warning and critical
notifications to an injected in-process sink. It does not publish to MQTT,
persist events, call Firebase, or establish that a dashboard received a
notification. For this stage, cloud upload responsibility belongs to the local
server bridge, not direct Firebase access from ESP32 firmware. Do not embed
Firebase service credentials in firmware, the frontend, Docker image layers,
or committed configuration.

The notifier remains an implementation boundary for production events: no
real sensor/event producer is wired to it. This stage connects only a
build-time opt-in synthetic producer to a local MQTT test-topic sink; it does
not establish a production event pipeline.

The supplied Firebase web-app snippet is client initialization configuration,
not a Firestore event API contract or a trusted server credential. Do not use
it to authorize firmware or bridge writes. Define the Firestore schema and
rules separately, then use an approved server-side identity for delivery.

## Ordering and prerequisites

- The local MQTT broker and ESP32-to-broker connectivity test exist, but the
  current `connectivity_test` message is not production telemetry or a
  canonical event schema.
- Define and approve the event contract before forwarding any device/sensor
  data. Until that is done, use an explicitly marked synthetic cloud-delivery
  test event; do not relabel connectivity-test messages or simulated
  dashboard values as real device events.
- The mock publisher is a separate, test-only ESP32 producer. It must not
  reuse or change the existing `connectivity_test` message contract.
- Connecting `EventNotifier` to a concrete local sink (such as an approved
  MQTT event publisher) requires the event topic/payload contract and must not
  be conflated with cloud delivery.
- Keep the implemented fallback AP and AP+STA recovery behavior unchanged in
  this stage. Defer AP+STA redesign, expanded AP-client routing/acceptance,
  and physical GPIO mapping until after this stage is reviewed and committed.
- Cloud delivery must not become a prerequisite for ESP32 sampling, local
  broker delivery, dashboard access, or local device control.

## Scope

### Included

- Select Cloud Firestore as the Firebase destination.
- Define an event envelope with a stable event ID, schema version, event
  type/priority, source/device identity, event timestamp, and validated
  payload.
- Consume only allowlisted MQTT event topics and validate size, schema,
  identity, timestamps, and allowed fields before cloud persistence.
- Add a server-side Firebase writer with TLS verification and credentials
  stored outside the repository and protected by the host.
- Add a durable local outbox so transient cloud/Internet failures do not lose
  accepted warning/critical events; define capacity, retention, and overflow
  behavior before implementation.
- Retry transient failures with bounded backoff and stable document IDs so
  retries are idempotent.
- Record cloud acknowledgement only after Firestore confirms the write, and
  expose local bridge/queue/cloud status without claiming upload success
  prematurely.
- Verify that Firebase failure does not interrupt MQTT ingestion or local
  operation.
- Add an ESP32 synthetic-event publisher, disabled by default and explicitly
  enabled only for testing. It generates mock payload values and publishes
  them to a dedicated test-only MQTT topic using the approved event envelope.
- Route synthetic events only to an isolated Firebase test project or
  test-only collection; never accept them as production sensor events or
  commands.

### Deferred

- Direct ESP32-to-Firebase upload or Firebase credentials in firmware.
- Uploading unverified sensor data, simulated UI values, or production
  device-control commands.
- Always-on or unbounded mock publishing, and synthetic events in production
  topics, dashboards, or Firestore collections.
- Firebase-triggered actuator actions, AI analysis, push notifications, and
  public/remote access.
- AP+STA changes, fallback AP routing to the laptop/Internet, GPIO mapping,
  and physical sensor/actuator integration.
- Claims of exactly-once delivery; the target is at-least-once attempts with
  idempotent Firestore writes and truthful acknowledgement.

## Proposed architecture

1. In normal builds, the ESP32 publishes only approved, versioned events to
   authenticated local MQTT. In an explicitly enabled test build, a separate
   mock publisher emits synthetic events to a dedicated test-only topic.
2. A local server process consumes only approved topics and validates each
   event before accepting it into a durable local outbox. Test-topic events
   are accepted only in the isolated test environment.
3. A cloud-delivery worker reads pending outbox entries and writes them to
   Firestore using a deterministic document ID derived from the event ID.
4. On confirmed Firestore success, the worker marks the local outbox item
   acknowledged and eligible for retention cleanup.
5. On transient failure, the event remains pending and is retried with bounded
   backoff. Invalid/permanent failures are surfaced and quarantined for review,
   not silently discarded or retried forever.
6. Firebase status and queue depth are reported separately from local Wi-Fi,
   MQTT broker, ESP32, and dashboard state.

Firebase must not be used as the authorization boundary for local device
control. The local MQTT broker and local controller remain authoritative for
local operation.

## Decisions to confirm before implementation

- Event producers and initial event types. Sensor readings are excluded until
  the hardware and data contract are verified.
- The mock event payload fields and generated value ranges. They must be
  labelled synthetic and must not imply a physical sensor or measurement
  unless that schema is explicitly chosen for testing.
- The test-only topic/namespace, synthetic source/device identity, event-ID
  format, and how the bridge prevents test events from entering production.
- The mock publisher's minimum interval, maximum messages per test run,
  enable/disable mechanism, and whether it may resume after reboot. Defaults
  must be disabled and bounded to avoid accidental cloud writes or quota use.
- MQTT topics, payload schema/version, timestamp source, event-ID generation,
  and validation rules.
- Firestore collection/document layout, retention/deletion policy, indexes,
  Firebase project/region, and security/IAM configuration.
- Whether a Firebase Admin SDK service account is acceptable on the local
  server. If used, keep its key outside the repo/image, mount it read-only,
  restrict OS access, and grant only required project permissions. Prefer
  workload identity/short-lived credentials if the deployment environment
  supports them.
- Durable outbox implementation and storage location on Windows and future
  local-server hosts. Decide capacity, retention, encryption/permissions,
  backup, flash/disk wear implications, and behavior when full.
- Retry/backoff limits, maximum event age, permanent-error handling, and
  whether low-priority telemetry may be coalesced or dropped. Warning/critical
  overflow must be explicit and observable.
- Which non-secret metrics/status the local dashboard should display.

## Implementation and verification steps

1. **Approve event contract and Firebase setup**
   - Choose the Firebase project and Cloud Firestore region/rules/IAM policy.
   - Define event IDs, schema version, topics, source identity, priority,
     payload limits, timestamp semantics, and malformed-event behavior.
   - Define the synthetic event envelope, mock fields/value ranges, test
     topic, test-run identity, event-ID generation, and production rejection
     rules alongside the real event contract.
   - Create a test-only Firebase project or isolated test collection.
   - Provision least-privilege server credentials without committing or
     printing secrets.

2. **Implement and test local durable outbox**
   - Select a durable storage format suitable for the local server.
   - Store an event before acknowledging it as accepted for cloud delivery.
   - Handle duplicate event IDs idempotently; never create a second Firestore
     document for a retry of the same event.
   - Implement capacity, retention, overflow, quarantine, and recovery
     behavior with explicit logs/metrics and no secret-bearing logs.

3. **Implement Firestore delivery worker**
   - Consume only explicitly allowlisted MQTT event topics.
   - Validate event schema and reject unknown or oversized payloads.
   - Write records using deterministic IDs and confirm the Firestore response
     before marking an event delivered.
   - Retry transient network/service errors using bounded exponential
     backoff; classify authentication, permission, and schema errors as
     actionable failures.
   - Keep MQTT consumption and local services running during cloud outages.

4. **Add the opt-in ESP32 mock-event publisher**
   - Add a build-time test option that defaults off; do not enable it in
     production firmware images.
   - Generate clearly marked synthetic payloads from the approved test schema
     and publish them only to the dedicated test topic after MQTT is connected.
   - Bound the publish interval and per-run count. Do not block sampling,
     normal MQTT work, the local API, or device-control tasks.
   - Use a test-run identifier plus monotonically increasing sequence in the
     event ID so retries are idempotent and a rebooted test run does not
     silently reuse IDs.
   - Ensure synthetic messages cannot be consumed as real sensor data or
     control commands, even if they reach the broker.

5. **Expose truthful local status**
   - Report Firebase connected/unavailable, pending count, oldest pending
     event age, last successful upload, and permanent failures separately.
   - Do not expose service-account credentials or sensitive event contents in
     browser responses.
   - Do not label broker acceptance as cloud persistence.

6. **Verify failure and recovery**
   - Enable the ESP32 mock publisher in a test build, connect it to the local
     broker, and verify generated events travel through the bridge and durable
     outbox to the isolated Firestore test destination.
   - Confirm mock source/type/test-run markers and generated values are
     preserved, and no document appears in the production destination.
   - Replay the same event ID and confirm it is idempotent; reboot or start a
     new test run and confirm IDs do not collide.
   - Stop Internet access or deny Firebase temporarily; confirm events remain
     in the outbox and local MQTT/dashboard paths continue.
   - Restore connectivity; confirm pending events upload and receive
     acknowledgements, with no duplicate documents.
   - Test invalid schema, oversized payload, invalid credentials, permission
     denial, Firestore throttling/service failure, full outbox, process
     restart, Docker restart, and duplicate/out-of-order events.
   - Inspect repository, Docker image/build context, logs, and browser assets
     for credentials and unintended event data.

7. **Record and stop for review**
   - Record the tested event schema, Firebase project environment (without
     secrets), delivery/duplicate results, outage recovery, outbox policies,
     and unresolved risks.
   - Stop for user review and a separate safe commit.
   - Do not start deferred AP+STA/GPIO work until this stage is reviewed and
     committed.

### Verified local emulator write

The local Firestore emulator write-through-outbox smoke test passed on
2026-11-26 using the demo project ID `demo-fault-tolerant-iot` and
`127.0.0.1:8080`. It verified a Firestore write and readback, duplicate replay
handling, and local outbox acknowledgement. The smoke test removed its
temporary Firestore document and local outbox afterward. This validates the
local Firestore writer and worker only; it does not verify MQTT ingestion,
ESP32 publishing, real cloud credentials, or live Firebase delivery.

## Acceptance criteria

- Only approved, versioned events are accepted for cloud delivery.
- A confirmed event is durably stored locally before being considered queued.
- A Firestore write is reported successful only after positive service
  acknowledgement.
- Re-delivery of the same event ID does not create duplicate Firestore
  records.
- Firebase/Internet outage does not block local MQTT ingestion or local
  control; pending events recover after connectivity returns.
- An explicitly enabled ESP32 test publisher automatically generates
  bounded, identifiable synthetic events and sends them through the local
  broker/bridge path to an isolated test destination.
- The mock publisher defaults off, uses a dedicated test topic and distinct
  source identity, and cannot cause synthetic data to appear as production
  sensor readings or commands.
- Queue-full and permanent-error cases are explicit, bounded, and observable.
- Firebase credentials are least-privileged, server-side, outside source
  control and Docker image layers, and absent from logs/browser assets.
- Test/simulated messages are never represented as sensor readings or
  production events.
- User reviews the evidence and independently commits this stage before
  deferred AP+STA or GPIO work begins.
