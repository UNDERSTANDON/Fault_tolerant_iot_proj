# Plan: Integrating the ESP32 and LAN Dashboard

## Status

Approved for implementation.
Added bridge node for TLS/WSS connection.

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

Stage 2 is complete only after the user reviews the implementation, tests,
network exposure, and secret handling, then creates a separate safe commit.
Any changes to hardware control, production provisioning, or remote access
require a separate scope and review.
