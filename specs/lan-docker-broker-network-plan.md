# Plan: Rebuilding the LAN Docker Broker and Hotspot Network

## Status

Approved for implementation;
Review passed, process to implement both the network and the
dashboard in sequence.
User reviewed.

The replacement `fault-tolerant-iot-mosquitto` container is running with its
MQTT/TLS and WSS listeners bound to the observed hotspot address
`192.168.137.1`. Host verification has passed certificate validation,
rejection of invalid credentials, publisher/read-only ACL separation,
cross-listener delivery, and recovery after a container restart. The previous
stopped broker container and its volumes were preserved.

Live hotspot integration is now verified: the ESP32 connected to Wi-Fi at
`192.168.137.35`, established MQTT/TLS using the local CA, and an independent
authenticated subscriber received its repeated test publications. The local
browser bridge also connected to the hotspot WSS endpoint and delivered an
ESP32 publication to an origin-checked browser client. These are connectivity
test messages, not production telemetry or device state.

The remaining review item is exposure validation: although the broker ports
are bound to the hotspot address and the Windows firewall profiles are
enabled, access from unintended interfaces/networks and the effective
firewall policy have not been independently tested. Do not begin Stage 2 until
this boundary is reviewed and the user independently commits the stage.

A project firewall helper has been applied. The Vite and MQTT/TLS allow rules
are scoped to the hotspot subnet. The first run failed to update Docker
Desktop's broad inbound rules because their `DeferToUser` edge-traversal
setting is incompatible with explicit address filters. The corrected helper
changes edge traversal to `Block`, then scopes and verifies each Docker rule.
The user reran it successfully; active Docker, TCP 5173, and TCP 8883 rules
were confirmed scoped to `192.168.137.1` and `192.168.137.0/24`. The latest
helper's TCP 8081 rule is now enabled and verified with the same local address
and remote subnet scope. The restarted authenticated bridge listens at
`192.168.137.1:8081`. The dashboard screenshot records a successful WSS
upgrade and a recent test-message status; a separate Nov. 16 physical-phone
capture confirms the dashboard and recent ESP32 test message on the phone.
The user reports proceeding past the certificate warning without installing
the CA, so the phone capture is not trusted-TLS evidence and the entered
browser token should be rotated. Independent reachability from unintended
networks and the review gate remain.

The first 30-minute laptop-side LAN stability run completed on Nov. 17. It
reported recovery with interruptions/check failures rather than an
uninterrupted pass: two dashboard HTTPS checks failed, six samples observed
the bridge disconnected, seven observed the broker unavailable, and the
monitor reconnected ten times. It received 56 ESP32 connectivity-test
messages, recorded no stale-message samples, and ended with bridge, broker,
and message state healthy. The user confirms they intentionally restarted
containers, the hotspot, and the bridge and disconnected/reconnected the ESP32
during the run, but does not remember when. The aggregate interruptions
therefore demonstrate recovery collectively, not per-component timing. The
monitor also cannot observe the phone UI. See the
[run summary](log_evidence/Lan-Docker_to_ESP_evidences/lan-stability-2026-11-17T06-03-14-419Z-summary.txt);
the matching [sample CSV](log_evidence/Lan-Docker_to_ESP_evidences/lan-stability-2026-11-17T06-03-14-419Z.csv)
is also attached.

## Goal

Recreate a reproducible Docker MQTT broker setup on the Windows laptop, which
also provides the ESP32's Wi-Fi hotspot. The broker will provide MQTT over
TLS for the ESP32 and MQTT over WebSockets with TLS (WSS) for LAN clients.
Establish and verify the actual network path rather than relying on a
historical hotspot address or Docker configuration.

## Evidence and boundaries

- The previous test recorded an ESP32 test publication received through the
  Docker-published broker at `192.168.137.1:1883`. This is historical
  evidence, not a promise that the current hotspot address or Docker setup
  matches.
- Existing firmware contains a test MQTT publisher. It is not production
  sensor telemetry or a device-control interface.
- The ESP32 fallback AP is a different network and is not assumed to route to
  the laptop or Docker broker.
- The broker will be a LAN development/test service, not an Internet-facing
  service. TLS encrypts traffic; authentication, topic authorization, and
  firewall restrictions are also required.
- Do not overwrite or delete any surviving local Docker configuration while
  investigating what remains. Keep secrets, private keys, and generated
  certificate material out of source control.

## Scope

### Included

- Inspect the current Windows hotspot interface, Docker engine/network mode,
  existing compose files, firewall rules, and repository ignore rules.
- Determine how clients connected to the laptop hotspot can reach a
  Docker-hosted broker. Record the observed interface and address as test
  results, not as hard-coded assumptions. (Verified: hotspot interface
  `Local Area Connection* 2`, host address `192.168.137.1`; ESP32 address
  `192.168.137.35`.)
- Create a reproducible Docker Compose and Mosquitto configuration for:
  - MQTT over TLS for ESP32 and other MQTT clients.
  - MQTT over WebSockets with TLS (WSS) for compatible clients.
  - Authenticated broker access and least-privilege topic ACLs.
- Restrict published ports and host firewall access to the intended local
  network. Disable anonymous access and avoid exposing a plaintext listener
  to LAN clients.
- Provide safe configuration templates and setup/verification instructions.
  Store actual credentials, private keys, and local-only settings outside
  version control.
- Verify broker startup, TLS certificate validation, authentication,
  authorization, listener reachability, and restart behavior.

### Deferred

- Replacing the demo topic/schema with production telemetry or commands.
- Internet access, remote access, public DNS, cloud integration, and
  production provisioning.
- Unreviewed cleanup of old Docker state, volumes, files, or credentials.

## Implementation and verification steps

1. **Inventory before changing anything**
   - Inspect repository files and local Docker configuration relevant to the
     broker. Do not print or copy secret values into reports.
   - Inspect the laptop hotspot interface and confirm whether hotspot clients
     are isolated from host services or can reach Docker-published ports.
   - Identify existing broker containers, volumes, and data that must be
     preserved. Ask before any destructive cleanup if the contents or scope
     are unclear.

2. **Choose the network and certificate model**
   - Record the Windows hotspot/Docker path and the expected MQTT TLS and WSS
     ports.
   - Choose a development certificate authority and broker certificate
     arrangement suitable for the local test. Include Subject Alternative
     Names for the names/IPs clients will actually use.
   - Do not disable certificate validation to work around name or trust
     errors. Document how the ESP32 and laptop trust the intended CA.
   - Keep private keys and generated credentials local and ignored by git.

3. **Implement reproducible broker configuration**
   - Add Docker Compose and Mosquitto configuration templates for MQTT/TLS
     and MQTT/WSS listeners.
   - Require authentication and define least-privilege topic ACLs for test
     clients. Use separate identities where practical for the ESP32 and
     server-side dashboard bridge.
   - Publish only the required ports and constrain Windows firewall access
     to the intended test network. Do not configure router port forwarding.
   - Ensure plaintext or anonymous listeners are not reachable from the
     hotspot/LAN.

4. **Verify the broker and network**
   - Confirm container health and listener startup without exposing secrets in
     logs.
   - From the laptop, verify MQTT over TLS and WSS with certificate
     verification enabled. (Passed.)
   - From a hotspot-connected client, verify expected reachability and
     certificate validation. (Passed from the ESP32 over MQTT/TLS; the
     independent subscriber and browser bridge also received ESP32 test
     publications.)
   - Verify invalid credentials and unauthorized topic operations are
     rejected; valid test publish/subscribe operations succeed only on
     permitted topics. (Passed.)
   - Restart the broker and confirm it returns to a healthy state. (Passed.)
   - Check that the services are not reachable from unintended interfaces or
     networks. (Pending independent verification; listeners are bound to
     `192.168.137.1` and project/Docker firewall rules are scoped to
     `192.168.137.0/24`.)

5. **Record evidence and stop for review**
   - Record the tested hotspot path, observed host address, listener ports,
     certificate trust result, access-control tests, and known limitations.
     (Evidence recorded below.)
   - Keep the evidence free of passwords, private keys, tokens, and
     credential-bearing connection strings.
   - Do not begin Stage 2 until the user has reviewed Stage 1, verified the
     exposure boundaries, and made a separate safe commit.

## Acceptance criteria

- A clean setup can start the broker using committed templates and
  machine-local secrets/certificates.
- MQTT/TLS and WSS listeners both work with certificate verification enabled.
- Anonymous and unauthorized access is rejected; allowed test identities can
  only use their permitted topics.
- The laptop and intended hotspot-connected clients can reach the expected
  broker endpoints, while unintended networks cannot.
- No local credentials, private keys, or generated secrets are committed.
- The test report distinguishes verified behavior from assumptions and
  records address changes or hotspot isolation limitations.
- User reviews and independently commits this stage before Stage 2 starts.

## Stage review gate

While I allows both stage to proceed at the same time, which allows
us to have the UI to work on, I am quite happy how this turns out.
I understand that the CA cert is practically not possible to distribute
to every single test device as well as access token being very
finicky to implement. Also, it's not saved into cookie which is an
issue when the user wants to F5. I'll put this into Stage 3's specs.

## Verification results

- The Docker container was running with MQTT/TLS on
  `192.168.137.1:8883` and WSS on `192.168.137.1:8084`.
- ESP32 serial output reported Wi-Fi address `192.168.137.35` and
  `MQTT connected`. The firmware loaded the local CA; certificate validation
  succeeded without disabling TLS verification.
- An independent authenticated MQTT/TLS subscriber received consecutive
  messages on `demo/esp32-mqtt-connectivity/test`. A later browser-bridge test
  connected to `wss://192.168.137.1:8084`, passed the browser ping/subscribe
  exchange, and delivered a live ESP32 test publication to the browser client.
- The MQTT verifier passed invalid-credential rejection on both listeners,
  publisher and bridge ACL separation, and cross-listener delivery.
- The browser bridge was bound to `127.0.0.1` during its browser delivery
  check; it is not exposed as a cross-device LAN service.
- Windows reports its Domain, Private, and Public firewall profiles enabled.
  The effective inbound rules and reachability from unintended networks have
  not been independently verified. Do not interpret profile status alone as
  proof of isolation.
- All three firewall profiles currently default to blocking inbound traffic
  and permit local firewall rules. Docker Desktop's enabled inbound rules for
  `com.docker.backend.exe` were verified with local address
  `192.168.137.1`, remote address `192.168.137.0/24`, and edge traversal
  `Block`. The broker container is currently the only running container and
  publishes MQTT/TLS and WSS on the hotspot address.
- [Configure-HotspotFirewall.ps1](../local_server/Configure-HotspotFirewall.ps1)
  has TCP 5173 and 8883 inbound allow rules restricted to
  `192.168.137.1` and `192.168.137.0/24`. Its initial attempt to restrict
  Docker Desktop failed with Windows error 0x80070057 because those rules use
  `DeferToUser` edge traversal. The corrected helper backs up/restores that
  policy, changes it to `Block` before applying address restrictions, and
  verifies each change. The user successfully applied this correction. The
  authenticated dashboard WSS rule for TCP 8081 is now enabled and verified
  with local address `192.168.137.1` and remote address
  `192.168.137.0/24`. Its successful browser handshake does not replace
  independent testing from unintended networks.
- The Nov. 16 dashboard capture
  ([dashboard_connection-2026-11-16-1352.png](log_evidence/Lan-Docker_to_ESP_evidences/dashboard_connection-2026-11-16-1352.png))
  records an HTTP 200 dashboard load, WSS HTTP 101 upgrade, connected bridge
  status, and a recent ESP32 connectivity-test timestamp in a DevTools view.
- The physical-phone capture
  ([phone_dashboard_connection-2026-11-16-1405.jpg](log_evidence/Lan-Docker_to_ESP_evidences/phone_dashboard_connection-2026-11-16-1405.jpg))
  shows the dashboard on the hotspot address, bridge connected, and an ESP32
  connectivity-test timestamp of 2:04:59 PM at 14:05. This verifies the
  phone-to-dashboard path at that time. The user proceeded past the
  certificate warning without installing the CA, so this is not trusted-TLS
  evidence; rotate the entered browser token before retesting. This also does
  not verify unintended-network isolation or recovery behavior.
- The Nov. 17 30-minute stability run
  ([lan-stability-2026-11-17T06-03-14-419Z-summary.txt](log_evidence/Lan-Docker_to_ESP_evidences/lan-stability-2026-11-17T06-03-14-419Z-summary.txt))
  verified invalid-token rejection, allowed-topic confirmation, 56 ESP32
  connectivity-test messages, and no stale-message samples. It also recorded
  two failed dashboard checks, six bridge-disconnected samples, seven
  broker-unavailable samples, and ten reconnects, followed by a healthy final
  state. This is recovery evidence with interruptions, not an uninterrupted
  pass. The associated
  [CSV sample log](log_evidence/Lan-Docker_to_ESP_evidences/lan-stability-2026-11-17T06-03-14-419Z.csv)
  is retained with the evidence. The user confirms the interruptions were
  intentional but cannot correlate them to timestamps; the monitor does not
  observe the phone.
- Test messages are the firmware connectivity demo only. Production telemetry,
  device commands, durable event capture, cloud forwarding, and deployment
  recovery remain outside this stage.
- The Nov. 14 serial capture
  ([esp32s3-2026-11-14.log](log_evidence/Lan-Docker_to_ESP_evidences/esp32s3-2026-11-14.log))
  records Wi-Fi association, MQTT connection, and local acceptance of QoS 0
  test publications. Local acceptance is not broker receipt confirmation.
- The latest Mosquitto export
  ([docker-logs-2026-11-14T08-51-57.148Z.csv](log_evidence/Lan-Docker_to_ESP_evidences/docker-logs-2026-11-14T08-51-57.148Z.csv))
  records TLS client connections and authorization rejections. Mosquitto's
  connection log does not itself prove a publication was delivered.
- The dashboard capture
  ([dashboard_connection_bridge.png](log_evidence/Lan-Docker_to_ESP_evidences/dashboard_connection_bridge.png))
  shows the bridge as connected and the ESP32 connectivity test as received
  recently at capture time. It is a point-in-time UI capture, not continuing
  connectivity evidence.
- The Node bridge captures
  ([dashboard-bridge-20261114-164524.log](log_evidence/Lan-Docker_to_ESP_evidences/dashboard-bridge-20261114-164524.log)
  and
  [dashboard-bridge-20261114-165356.log](log_evidence/Lan-Docker_to_ESP_evidences/dashboard-bridge-20261114-165356.log))
  show the bridge listening on loopback, connecting to the broker over WSS,
  subscribing to the allowed test topic, and receiving ESP32 test messages.
  They do not demonstrate phone-to-bridge connectivity.
- Phone CA cert
  ([phone_connection-2026-11-16-1506.jpg](log_evidence/Lan-Docker_to_ESP-evidence/phone_connection-2026-11-16-1506.jpg))
  shows the CA certificate being approved on the phone and the browser then
  connecting into the bridge through that trusted certificate path, confirming
  the phone accepted the local CA and reached the bridge successfully.
  