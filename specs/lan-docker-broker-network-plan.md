# Plan: Rebuilding the LAN Docker Broker and Hotspot Network

## Status

Approved for implementation; Stage 1 is in progress and has not passed its
review gate.

The local Mosquitto container has been recreated as
`fault-tolerant-iot-mosquitto`. Its MQTT/TLS and WSS listeners are bound to
`127.0.0.1` only. Local verification has passed for certificate validation,
rejected invalid credentials, publisher/read-only ACL separation, delivery
from MQTT/TLS to WSS, and recovery after a container restart. The previous
stopped broker container and its volumes were preserved.

The Windows hotspot is currently inactive, so hotspot-client reachability and
firewall exposure have not been tested. The ESP32 firmware also does not yet
load the generated private CA. These gaps prevent Stage 1 acceptance and
ESP32-to-broker integration; do not treat the localhost tests as evidence of
either.
Implementation and verification of this stage must stop for user review before
Stage 2 begins.

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
  results, not as hard-coded assumptions.
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

- Changes to ESP32 firmware or React application source.
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
     verification enabled.
   - From a hotspot-connected client, verify expected reachability and
     certificate validation.
   - Verify invalid credentials and unauthorized topic operations are
     rejected; valid test publish/subscribe operations succeed only on
     permitted topics.
   - Restart the broker and confirm it returns to a healthy state.
   - Check that the services are not reachable from unintended interfaces or
     networks.

5. **Record evidence and stop for review**
   - Record the tested hotspot path, observed host address, listener ports,
     certificate trust result, access-control tests, and known limitations.
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

Stop after satisfying the acceptance criteria. Present the configuration
files, test outcomes, network exposure, secret handling, and unresolved risks
for user review. Do not automatically commit or proceed to Stage 2.
