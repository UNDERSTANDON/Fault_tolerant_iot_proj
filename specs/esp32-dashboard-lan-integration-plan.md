# Plan: Integrating the ESP32 and LAN Dashboard

## Status

Approved for implementation.
Added bridge node for TLS/WSS connection.
Added clear setup instructions.

Step 3's existing Node bridge was exercised with a live ESP32 connectivity
test publication on 2026-11-14. The bridge connected to the broker over WSS
with certificate verification enabled and delivered the ESP32 message to a
same-host WebSocket test client using an allowed Origin header. This verifies
test-message delivery only; it does not verify dashboard integration or
sensor telemetry.

The browser-facing bridge was bound to loopback for this Nov. 14 test and
accepted the configured browser origin. That test predates the LAN WSS and
token-authentication changes. The Nov. 16 physical-phone capture now confirms
the phone can load the dashboard, see the bridge as connected, and receive a
recent ESP32 connectivity-test message. This verifies the test-data path at
that time, not sensor/actuator behavior or recovery. The user reports they
proceeded past the certificate warning without installing the CA, so this is
not valid evidence of trusted TLS and must not be accepted as a secure phone
session. The entered browser token should be rotated before retesting. Stage
1's separate review gate remains outstanding.

Step 4's dashboard changes are implemented for the connectivity-test path.
The dashboard now separates actual bridge/broker status and ESP32 test-message
freshness from simulated internet/LAN, room readings, and device controls.
The Nov. 14 capture records the earlier loopback bridge. The Nov. 16 capture
([dashboard_connection-2026-11-16-1352.png](log_evidence/Lan-Docker_to_ESP_evidences/dashboard_connection-2026-11-16-1352.png))
shows the page returning HTTP 200, a WebSocket upgrade returning HTTP 101,
the bridge as connected, and an ESP32 connectivity test received at 1:51 PM.
The user reports restarting the bridge. The later physical-phone capture
([phone_dashboard_connection-2026-11-16-1405.jpg](log_evidence/Lan-Docker_to_ESP_evidences/phone_dashboard_connection-2026-11-16-1405.jpg))
shows the dashboard on the hotspot address with the bridge connected and the
last ESP32 test message at 2:04:59 PM. Recovery and stale-state transitions
remain unverified. The user proceeded past the certificate warning without
installing the local CA; therefore the capture does not establish trusted
TLS, and the token entered during that session must be rotated.

Step 5 firewall setup scopes Docker Desktop and the Vite/MQTT/WSS ports to the
current hotspot subnet. The active bridge listener is now bound to
`192.168.137.1:8081`; its enabled firewall rule is scoped to local
`192.168.137.1` and remote `192.168.137.0/24`. The active Vite server serves
HTTPS with the local CA. Laptop HTTPS and WSS smoke tests pass with CA
verification, Origin rejection, invalid/valid browser tokens, connected
broker status, and the topic allowlist. The Nov. 16 screenshot adds browser
WSS/dashboard evidence, and the 14:05 capture confirms phone access with a
recent ESP32 test message. The user reports bypassing the certificate warning,
so trusted TLS is not established and the token must be rotated before the
next phone test. Stage 1's separate exposure/review gate remains outstanding.
`local_server/lan_stability_monitor.mjs` now provides a 30-minute HTTPS/WSS and
ESP32-message-freshness monitor with secret-free CSV/summary output. The first
30-minute run completed with a recovered-interruption result: 179 dashboard
HTTPS checks (2 failed), 6 bridge-disconnected samples, 7 broker-unavailable
samples, 10 bridge reconnects, 56 test messages, and no stale-message samples.
The final bridge/broker/message state was healthy. The user confirms they
intentionally restarted containers, the hotspot, the bridge, and the ESP32
connection during the run, but does not remember their approximate times.
Thus, this is recovery evidence for those components collectively, not a
per-component timing/correlation result. The monitor ran on the laptop and
cannot observe phone UI state; phone verification remains separate.

## Goal

Connect the ESP32 and the LAN-hosted dashboard to the verified Docker broker
on the laptop hotspot network. The ESP32 will use MQTT over TLS. A local Node
service will connect to the broker over WSS and mediate dashboard traffic,
keeping broker credentials out of browser code.

## Prerequisites

- [Stage 1: Rebuilding the LAN Docker Broker and Hotspot Network](lan-docker-broker-network-plan.md)
  has passed its acceptance criteria, been reviewed by the user, and has a
  separate user-created commit.
- The tested broker host name/address, TLS trust chain, MQTT TLS endpoint,
  WSS endpoint, authentication identities, and topic ACLs are documented
  without disclosing secrets.
- The browser-to-Node-service security model and dashboard hosting location
  are confirmed before implementation. If LAN clients other than the laptop
  browser need access, the Node service and its TLS certificate must be
  reachable and trusted from those clients.

## Evidence and boundaries

- The firmware's existing publisher sends test data, not sensor readings or
  confirmed device state. Keep it labeled and isolated as test traffic.
- The embedded ESP32 web server currently serves static frontend assets; it
  does not implement the MQTT/WebSocket API described by the interface
  contract.
- The React dashboard currently simulates network and device state. Do not
  treat displayed status or acknowledgements as live device evidence.
- The browser must not receive the broker's reusable username/password or
  private key. The local Node service owns broker credentials and connects
  to the broker using MQTT over WSS with certificate validation enabled.
- The LAN development dashboard and bridge use HTTPS/WSS with the local CA.
  Browser authentication uses a separate random 256-bit token kept in the
  machine-local credentials file and entered at runtime; it is not included
  in the Vite bundle or URL. The bridge checks the exact HTTPS Origin and
  forwards only the read-only connectivity-test topic.
- MQTT transport TLS does not itself authorize browser users, limit topics,
  or secure browser-to-Node traffic. Apply authentication, authorization,
  topic restrictions, and local-network exposure controls at each boundary.
- Do not enable actuators, claim sensor telemetry is live, or make safety
  decisions from this connectivity integration.

## Scope

### Included

- Configure the ESP32 MQTT client for MQTT over TLS to the Stage 1 broker,
  with trusted certificate validation and a dedicated least-privilege
  identity.
- Implement a local Node service that connects to the broker over WSS using
  server-side credentials and validates the broker certificate.
- Expose a narrow browser-facing interface over WSS (or an explicitly
  justified same-host equivalent) with authentication and topic/payload
  validation.
- Connect the npm-hosted dashboard to the local service and distinguish
  verified live data, stale data, simulated data, and unavailable services.
- Test reconnect/recovery for broker restart and laptop/hotspot interruption.
- Keep secrets out of source control, frontend bundles, URLs, and logs.

### Deferred

- Production sensor telemetry, device commands, actuator control, and
  hardware safety behavior.
- Internet/remote access, cloud sync, Firebase, and public deployment.
- Persistent delivery queues or guarantees beyond the verified MQTT QoS and
  application behavior.
- Production identity provisioning or claims of production-grade security.

## Implementation and verification steps

1. **Confirm interfaces and security boundaries**
   - Confirm dashboard hosting mode (Vite development server, built static
     site, or another LAN host) and which browser clients need access.
   - Define the Node service's bind address, browser authentication method,
     origin policy, WSS certificate trust, allowed topics, payload schemas,
     and stale-data behavior.
   - Define separate least-privilege broker identities and ACL entries for
     the ESP32 publisher and Node bridge.
   - Decide whether the integration remains test-only or introduces a
     versioned sensor telemetry contract. Do not relabel test messages as
     sensor data.

2. **Integrate ESP32 MQTT over TLS**
   - Configure the broker URI, CA trust, and local credentials through
     machine-local ESP-IDF configuration or another reviewed mechanism.
   - Ensure TLS certificate validation remains enabled; do not embed
     reusable production secrets in committed source or report files.
   - Confirm the publisher can connect, publish only its allowed test topic,
     and reconnect after a broker restart without blocking unrelated work.
   - Verify broker receipt with an independent subscriber.

3. **Implement the local Node broker bridge**
   - Connect from the Node service to the Stage 1 broker WSS listener using
     TLS verification and server-side credentials.
   - Do not expose broker credentials to the browser or include them in
     Vite environment variables that are bundled into frontend code.
   - Validate incoming browser messages and broker messages against the
     approved topic and payload allowlist. Reject malformed, unauthorized,
     oversized, or unexpected messages explicitly.
   - Bind only to the required host/LAN interfaces. Apply browser
     authentication, origin checks, and TLS to the browser-to-Node connection
     where it crosses the LAN.
   - Surface broker and client connection failures; avoid success-shaped
     fallbacks or silent simulated acknowledgements.

4. **Integrate the dashboard**
   - Replace only the explicitly scoped simulated network/data path with the
     local service connection; retain clear labels for simulations and
     unsupported hardware.
   - Show connection state, last update time, stale status, and unavailable
     errors based on actual service messages.
   - Do not show a command as successful without a defined, observed
     acknowledgement from the intended backend/device.
   - Keep the browser bundle free of broker credentials, private keys, and
     server-only configuration.

5. **Exercise recovery and exposure**
   - Verify ESP32-to-broker MQTT/TLS and Node-to-broker WSS with certificate
     validation enabled.
   - Verify dashboard-to-Node WSS and authentication from the laptop and each
     intended hotspot-connected client.
   - Test invalid identity, denied topic access, malformed payloads, and
     unauthorized browser access.
   - Restart the broker, Node service, Docker, and laptop/hotspot connection
     separately. Confirm services recover and the UI shows disconnected or
     stale states until fresh data arrives.
   - Verify hotspot address changes and ensure no endpoint unexpectedly
     depends on `localhost` from a different device.
   - Inspect browser assets and logs for credentials, tokens, private keys,
     and sensitive payloads.

6. **Record results and stop for review**
   - Document the exact tested topology, protocol/TLS endpoints, allowed
     topics, identity roles, and recovery outcomes without secret values.
   - Clearly separate verified live data from simulations, test messages,
     and unimplemented device features.
   - Stop for user review and a separate safe commit. Do not automatically
     commit or proceed beyond the reviewed scope.

## Test evidence so far

- The ESP32 was configured for `mqtts://192.168.137.1:8883`; the local
  `sdkconfig` had custom-CA trust enabled and the CA PEM was present.
- The broker was running with MQTT/TLS on `192.168.137.1:8883` and WSS on
  `192.168.137.1:8084`. The ESP32 test publisher sent to
  `demo/esp32-mqtt-connectivity/test`.
- The Node bridge connected to the WSS listener with certificate verification
  enabled, subscribed to the test topic, and forwarded a live ESP32
  `connectivity_test` message to a local WebSocket test client using the
  allowed local Origin header. The payload schema and sequence were validated.
- The bridge was not exposed to the LAN; no browser password/session
  authentication or browser-to-Node TLS was tested. Do not use this loopback
  test as evidence of cross-device dashboard access.
- Only the firmware's versioned connectivity test payload was verified. No
  physical sensor readings, actuator commands, or production telemetry were
  tested.

## Step 4 implementation and verification

- The React dashboard consumes only the approved connectivity-test topic and
  validates its topic and versioned payload before displaying it. The bridge
  connection status is separate from simulated LAN/internet state. The UI
  reports the last test-message receipt and marks it stale after 70 seconds;
  bridge errors and an unconfigured endpoint are shown explicitly.
- MQTT test messages do not modify room readings or device states. Room
  sensors, hazard displays, device controls, fault scenarios, and research
  metrics are explicitly labeled as simulated. Device toggles no longer claim
  an acknowledgement or successful hardware command.
- `npm run build` passed and emitted the configured firmware assets
  (`index.html`, `app.js`, and `style.css`). A local-secret scan confirmed
  broker passwords are absent from the generated browser bundle.
- The supplied dashboard capture
  ([dashboard_connection_bridge.png](log_evidence/Lan-Docker_to_ESP_evidences/dashboard_connection_bridge.png))
  provides point-in-time browser evidence of a connected bridge and a
  recently received ESP32 test message. A local `.env` now exists, but its
  values are not included in evidence. The screenshot does not verify
  subsequent message freshness, stale/recovery transitions, or continued
  connectivity.
- The bridge stdout captures
  ([dashboard-bridge-20261114-164524.log](log_evidence/Lan-Docker_to_ESP_evidences/dashboard-bridge-20261114-164524.log)
  and
  [dashboard-bridge-20261114-165356.log](log_evidence/Lan-Docker_to_ESP_evidences/dashboard-bridge-20261114-165356.log))
  show broker connection over verified WSS, subscription, and received test
  messages while the bridge was bound to loopback. They do not prove phone
  browser connectivity. `npm run lint` is unavailable because this project
  has no `eslint.config.*` for its ESLint 10 setup.
- The Nov. 14 Node bridge evidence shows the earlier loopback-only service
  with no browser password/session authentication or browser-to-Node TLS.
  Current code adds LAN TLS and token authentication, but those captures do
  not verify the new behavior.
- The Nov. 16 dashboard capture
  ([dashboard_connection-2026-11-16-1352.png](log_evidence/Lan-Docker_to_ESP_evidences/dashboard_connection-2026-11-16-1352.png))
  shows an HTTP 200 page load, WSS HTTP 101 upgrade, connected bridge status,
  and a recent test-message timestamp in a mobile-sized DevTools view.
- The later physical-phone capture
  ([phone_dashboard_connection-2026-11-16-1405.jpg](log_evidence/Lan-Docker_to_ESP_evidences/phone_dashboard_connection-2026-11-16-1405.jpg))
  shows the dashboard loaded at the hotspot address, bridge connected, and
  the last ESP32 test message at 2:04:59 PM while the phone clock read 14:05.
  The user reports they proceeded past the certificate warning without
  installing the CA. Treat this as an insecure diagnostic run, not trusted-TLS
  acceptance; rotate the entered browser token before retesting. Recovery and
  stale transitions remain unverified.
- A local smoke test of the current dev servers verified the dashboard's
  HTTPS certificate against the local CA and the bridge's WSS certificate,
  exact-origin rejection, invalid-token rejection, valid-token acceptance,
  connected broker status, and connectivity-test topic allowlist response.
  This test ran from the laptop, not the phone; it did not verify receipt of
  a new ESP32 publication.
- The Windows firewall helper
  ([Configure-HotspotFirewall.ps1](../local_server/Configure-HotspotFirewall.ps1))
  has created hotspot-scoped Vite and MQTT/TLS rules and narrowed Docker
  Desktop ingress. TCP 8081 is now enabled for authenticated WSS with local
  address `192.168.137.1` and remote subnet `192.168.137.0/24`. The initial
  Docker scope update failed on `DeferToUser`; the corrected version changed
  edge traversal to `Block` and was verified in the active policy store.
- `Configure-LanDashboard.ps1` has configured the ignored local environment
  files for HTTPS/WSS on `192.168.137.1` and generated a local browser token.
  The user reports restarting the bridge, and the current listener is verified
  on `192.168.137.1:8081`. The physical-phone dashboard capture verifies
  browser access and recent test-message display, but the user reports
  bypassing the certificate warning instead of installing the CA. Trusted
  TLS remains unverified, and the token entered in that session must be
  rotated before the next test.
- `npm run test:lan -- --duration-minutes 30` runs
  `local_server/lan_stability_monitor.mjs`. It verifies HTTPS with the local CA,
  checks the dashboard, rejects an invalid browser token, authenticates to
  WSS, observes broker status and ESP32 test-message freshness, and reconnects
  its monitor after bridge interruptions. It does not restart services or
  observe the phone UI. Its CSV and summary are written outside the repository
  under `%LOCALAPPDATA%\FaultTolerantIoT\test-runs`. The Nov. 17 run completed
  for 30 minutes with 2 dashboard HTTPS failures, 6 bridge-disconnected
  samples, 7 broker-unavailable samples, 10 reconnects, 56 test messages, no
  stale samples, and a healthy final state. The summary is
  [lan-stability-2026-11-17T06-03-14-419Z-summary.txt](log_evidence/Lan-Docker_to_ESP_evidences/lan-stability-2026-11-17T06-03-14-419Z-summary.txt).
  The matching detailed
  [CSV](log_evidence/Lan-Docker_to_ESP_evidences/lan-stability-2026-11-17T06-03-14-419Z.csv)
  is also attached as evidence. The user confirms intentional container,
  hotspot, bridge, and ESP32 disconnect/reconnect actions during the run, but
  their times are unknown, so outages cannot be attributed per component.
  This is recovery evidence, not an uninterrupted PASS; phone UI/CA trust was
  not observed by the monitor.

## Acceptance criteria

- The ESP32 establishes a validated MQTT/TLS connection and an independent
  subscriber observes the expected test message on its authorized topic.
- The local Node service connects to the Docker broker over WSS with
  certificate validation and server-side credentials.
- The dashboard exchanges only approved data with the authenticated local
  service over the intended secure path.
- No broker credentials or private keys appear in browser bundles, committed
  files, logs, or URLs.
- Unauthorized clients, topics, and malformed payloads are rejected.
- Broker, Node, or hotspot interruption is shown as unavailable/stale and
  recovers without claiming delivery before fresh data is observed.
- No sensor, actuator, or safety behavior is presented as verified unless
  separately tested against actual hardware.
- User reviews and independently commits this stage after acceptance.

## Stage review gate

User reviewed.
There is not much I can say that isn't repeated from the aforementioned.
