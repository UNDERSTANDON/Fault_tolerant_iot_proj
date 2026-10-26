# IoT COMMUNICATION & TELEMETRY INTERFACE CONTRACT
## Topic 6.1: Fault-Tolerant Interface for IoT and Smart Environments
**Document Version:** 1.0.0  
**Status:** Approved Specification  
**Target Architecture:** React Web Frontend ↔ ESP32 Central Access Point Gateway / MQTT Broker

---

## 1. ARCHITECTURAL OVERVIEW

The Smart Home system utilizes a **Local-First, Dual-Path Architecture** to ensure uninterrupted domestic control during wide-area network (Internet) outages:

1. **Cloud Path (Normal Mode):**
   * Protocol: MQTT over WSS (WebSocket Secure) / TLS.
   * Remote Broker: `wss://broker.hivemq.com:8884/mqtt` (or team cloud endpoint).
   * Used for cloud synchronization, remote access, and external telemetry storage.

2. **Local Fallback Path (Local Mode):**
   * Protocol: Direct WebSocket over TCP / HTTP REST.
   * Local Gateway AP: `ws://192.168.1.1:8080/ws` (ESP32 Access Point).
   * Used whenever the public Internet is down, ensuring sub-20ms domestic control latency.

---

## 2. MQTT TOPIC HIERARCHY

All topic naming follows the structured format: `home/<zone>/<device_type>/<device_id>/<action>`

| Topic Pattern | Direction | Purpose | QoS | Payload Format |
| :--- | :--- | :--- | :--- | :--- |
| `home/+/+/+/set` | Web ➔ ESP32 | Send control command to a device | 1 | JSON Command Payload |
| `home/+/+/+/state` | ESP32 ➔ Web | Publish confirmed device state (ACK) | 1 | JSON State Payload |
| `home/<zone>/telemetry` | ESP32 ➔ Web | Broadcast periodic environmental sensors | 0 | JSON Telemetry Payload |
| `home/gateway/heartbeat` | ESP32 ➔ Web | Heartbeat & network path status | 1 | JSON Heartbeat Payload |

---

## 3. JSON PAYLOAD SCHEMAS

### 3.1 Device Control Command Payload (Frontend ➔ ESP32)
Topic Example: `home/living_room/light/living_light/set`

```json
{
  "commandId": "cmd-1729960000-abcd",
  "deviceId": "living_light",
  "targetState": "ON",
  "routingPath": "LOCAL_LAN",
  "timestamp": "2026-10-26T21:30:00.000Z"
}
```

* `commandId` (string, required): Unique UUID for tracking round-trip latency.
* `deviceId` (string, required): Hardware identifier (`hallway_light`, `door_nfc`, `living_light`, `living_fan`, `kitchen_light`, `bedroom_light`).
* `targetState` (string, required): `"ON"` | `"OFF"` | `"LOCKED"` | `"UNLOCKED"`.
* `routingPath` (string, optional): `"CLOUD_MQTT"` | `"LOCAL_LAN"`.

---

### 3.2 Confirmed State Payload (ESP32 ➔ Frontend)
Topic Example: `home/living_room/light/living_light/state`

```json
{
  "commandId": "cmd-1729960000-abcd",
  "deviceId": "living_light",
  "state": "ON",
  "status": "SUCCESS",
  "hardwarePin": 23,
  "timestamp": "2026-10-26T21:30:00.018Z"
}
```

* `status`: `"SUCCESS"` | `"FAILED"` | `"BUSY"`.
* The frontend uses `timestamp` delta to calculate and display the **Average Command Response Time** ($\Delta t_{cmd}$).

---

### 3.3 Environmental Telemetry Payload (ESP32 ➔ Frontend)
Topic Example: `home/kitchen/telemetry`

```json
{
  "zoneId": "kitchen",
  "sensors": {
    "temperature": 29.4,
    "humidity": 65.2,
    "smoke": "NORMAL"
  },
  "batteryPercent": 100,
  "timestamp": "2026-10-26T21:30:05.000Z"
}
```

* `smoke`: Values must be `"NORMAL"` (safe) or `"ALERT"` (smoke detected, triggers critical visual hazard on UI).
* Periodicity: Broadcast every $3000\text{ms}$ or immediately on state change.

---

### 3.4 Gateway Heartbeat & Failover Signal (ESP32 ➔ Frontend)
Topic: `home/gateway/heartbeat`

```json
{
  "gatewayId": "esp32_central_ap",
  "internetAvailable": true,
  "localLanAvailable": true,
  "connectedClients": 3,
  "freeHeapBytes": 184520,
  "rssi": -42,
  "timestamp": "2026-10-26T21:30:02.000Z"
}
```

* When `internetAvailable` transitions to `false`:
  1. Frontend automatically transitions: `NORMAL` ➔ `SWITCHING` ➔ `LOCAL`.
  2. Banners adapt to amber Local Mode.
  3. Commands are rerouted to `ws://192.168.1.1:8080/ws`.

---

## 4. LOCAL WEBSOCKET P2P PROTOCOL (When Internet is Down)

When the public Internet is offline, the React frontend connects directly to the ESP32 WebSocket server:
* **Endpoint:** `ws://192.168.1.1:8080/ws`
* **Message Framing:** JSON text frames matching Section 3.1 & 3.2.
* **Keep-alive:** Ping/Pong frame every $2000\text{ms}$. If 2 consecutive pings fail, frontend transitions to `UNAVAILABLE`.

---

## 5. HARDWARE DEVICE ID MAPPING TABLE

| Zone ID | Device ID | Hardware Role | Payload Value |
| :--- | :--- | :--- | :--- |
| `hallway` | `hallway_light` | Relay / MOSFET Switch | `ON` / `OFF` |
| `hallway` | `door_nfc` | Solenoid / Servo Lock | `LOCKED` / `UNLOCKED` |
| `hallway` | `ups_backup` | Analog ADC Voltage Divider | `0%` – `100%` |
| `living_room` | `living_light` | Relay / LED Driver | `ON` / `OFF` |
| `living_room` | `living_fan` | PWM Fan Driver | `ON` / `OFF` |
| `living_room` | `living_temp` | DHT22 / DS18B20 Temp | Float (°C) |
| `living_room` | `living_smoke` | MQ-2 / MQ-135 Gas Sensor | `NORMAL` / `ALERT` |
| `living_room` | `living_ap` | ESP32 Access Point Gateway | `ONLINE` / `OFFLINE` |
| `kitchen` | `kitchen_light` | Relay Switch | `ON` / `OFF` |
| `kitchen` | `kitchen_temp` | DHT22 Temperature | Float (°C) |
| `kitchen` | `kitchen_humidity` | DHT22 Relative Humidity | Float (%) |
| `kitchen` | `kitchen_smoke` | MQ-2 Smoke Detector | `NORMAL` / `ALERT` |
| `bedroom` | `bedroom_light` | Relay Switch | `ON` / `OFF` |
| `bedroom` | `bedroom_temp` | DHT22 Temperature | Float (°C) |
| `bedroom` | `bedroom_smoke` | MQ-2 Smoke Detector | `NORMAL` / `ALERT` |

---

## 6. VERIFICATION CRITERIA

1. **Sub-second Failover**: $\Delta t_{fallback} \le 500\text{ms}$ upon public Internet loss.
2. **Local Control Availability**: 100% of switchable endpoints must execute over LAN during `LOCAL` mode.
3. **Recovery Buffer Flush**: Buffered commands and telemetry events must synchronize upon carrier restoration.

