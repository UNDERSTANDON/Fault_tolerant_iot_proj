import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import https from 'node:https';
import WebSocket, { WebSocketServer } from 'ws';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createLocalAdminAccount } from './setup_local_admin.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const allowedHttpOrigin = 'http://localhost:5173';
const opensslAvailable = spawnSync('openssl', ['version'], { stdio: 'ignore' }).status === 0;

async function getAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function encodeRemainingLength(length) {
  const bytes = [];
  let value = length;
  do {
    let encoded = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) encoded |= 0x80;
    bytes.push(encoded);
  } while (value > 0);
  return Buffer.from(bytes);
}

function decodeRemainingLength(buffer, offset) {
  let multiplier = 1;
  let value = 0;
  let cursor = offset;
  let encodedByte = 0;
  do {
    if (cursor >= buffer.length) return null;
    encodedByte = buffer[cursor++];
    value += (encodedByte & 0x7f) * multiplier;
    multiplier *= 128;
  } while ((encodedByte & 0x80) !== 0);
  return { length: value, nextOffset: cursor };
}

function buildMqttPublishPacket(topic, payloadObject) {
  const topicBuf = Buffer.from(topic, 'utf8');
  const payloadBuf = Buffer.from(JSON.stringify(payloadObject), 'utf8');
  const headerLen = 2 + topicBuf.length + payloadBuf.length;
  const remLenBuf = encodeRemainingLength(headerLen);
  const packet = Buffer.alloc(1 + remLenBuf.length + headerLen);
  let pos = 0;
  packet[pos++] = 0x30; // PUBLISH QoS 0
  remLenBuf.copy(packet, pos);
  pos += remLenBuf.length;
  packet.writeUInt16BE(topicBuf.length, pos);
  pos += 2;
  topicBuf.copy(packet, pos);
  pos += topicBuf.length;
  payloadBuf.copy(packet, pos);
  return packet;
}

function createMockWssMqttBroker({ cert, key }) {
  const httpsServer = https.createServer({ cert, key });
  const wss = new WebSocketServer({ server: httpsServer });
  const publishedCommands = [];
  const subscribedTopics = [];
  let activeSocket = null;
  let subscribeResolve;
  const subscribedPromise = new Promise((resolve) => {
    subscribeResolve = resolve;
  });

  wss.on('connection', (socket) => {
    activeSocket = socket;
    let rxBuffer = Buffer.alloc(0);

    socket.on('message', (chunk) => {
      rxBuffer = Buffer.concat([rxBuffer, Buffer.from(chunk)]);
      while (rxBuffer.length >= 2) {
        const packetType = rxBuffer[0] >> 4;
        const qos = (rxBuffer[0] >> 1) & 0x03;
        const rem = decodeRemainingLength(rxBuffer, 1);
        if (!rem) break;
        const totalLength = rem.nextOffset + rem.length;
        if (rxBuffer.length < totalLength) break;

        const body = rxBuffer.subarray(rem.nextOffset, totalLength);
        rxBuffer = rxBuffer.subarray(totalLength);

        if (packetType === 1) {
          // CONNECT -> CONNACK
          socket.send(Buffer.from([0x20, 0x02, 0x00, 0x00]));
        } else if (packetType === 8) {
          // SUBSCRIBE -> SUBACK
          const packetId = body.readUInt16BE(0);
          let cursor = 2;
          let count = 0;
          while (cursor + 2 <= body.length) {
            const topicLen = body.readUInt16BE(cursor);
            cursor += 2;
            const topic = body.subarray(cursor, cursor + topicLen).toString('utf8');
            cursor += topicLen + 1; // skip QoS byte
            subscribedTopics.push(topic);
            count += 1;
          }
          const suback = Buffer.alloc(4 + count);
          suback[0] = 0x90;
          suback[1] = 2 + count;
          suback.writeUInt16BE(packetId, 2);
          for (let i = 0; i < count; i += 1) suback[4 + i] = 0x01;
          socket.send(suback);
          if (subscribedTopics.includes('home/esp32/telemetry')) {
            subscribeResolve?.();
          }
        } else if (packetType === 12) {
          // PINGREQ -> PINGRESP
          socket.send(Buffer.from([0xd0, 0x00]));
        } else if (packetType === 3) {
          // PUBLISH
          const topicLen = body.readUInt16BE(0);
          let cursor = 2;
          const topic = body.subarray(cursor, cursor + topicLen).toString('utf8');
          cursor += topicLen;
          if (qos > 0) {
            const packetId = body.readUInt16BE(cursor);
            cursor += 2;
            socket.send(Buffer.from([0x40, 0x02, (packetId >> 8) & 0xff, packetId & 0xff]));
          }
          const payloadText = body.subarray(cursor).toString('utf8');
          publishedCommands.push({ topic, payload: JSON.parse(payloadText) });
        }
      }
    });
  });

  return {
    httpsServer,
    wss,
    publishedCommands,
    subscribedTopics,
    waitUntilSubscribed: () => subscribedPromise,
    sendBrokerMessage: (topic, payloadObject) => {
      assert.ok(activeSocket && activeSocket.readyState === WebSocket.OPEN, 'mock broker client not connected');
      activeSocket.send(buildMqttPublishPacket(topic, payloadObject));
    }
  };
}

function startBridge({
  appDataDir,
  port,
  username,
  password,
  brokerUrl = 'wss://127.0.0.1:1',
  brokerCaPath = ''
}) {
  createLocalAdminAccount({
    usersFile: path.join(appDataDir, 'FaultTolerantIoT', 'local-server', 'users.json'),
    username,
    password
  });
  const env = {
    ...process.env,
    LOCALAPPDATA: appDataDir,
    LOCAL_BROKER_CREDENTIALS: '',
    FIRESTORE_TEST_ENABLED: 'false',
    FIRESTORE_TEST_EMULATOR: 'false',
    FIRESTORE_EMULATOR_HOST: '',
    GOOGLE_APPLICATION_CREDENTIALS: '',
    BRIDGE_HOST: '127.0.0.1',
    BRIDGE_PORT: String(port),
    BRIDGE_ALLOWED_ORIGINS: allowedHttpOrigin,
    BRIDGE_TLS_CERT_PATH: '',
    BRIDGE_TLS_KEY_PATH: '',
    BROKER_URL: brokerUrl,
    BROKER_USERNAME: 'dashboard_bridge',
    BROKER_PASSWORD: 'test-password',
    BROKER_CA_PATH: brokerCaPath
  };
  const child = spawn(process.execPath, ['lan_broker_bridge.mjs'], {
    cwd: __dirname,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return { child };
}

async function stopBridge(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exited, delay(1000)]);
  }
}

async function waitForHealth(port) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return true;
    } catch {
      // retry
    }
    await delay(100);
  }
  return false;
}

async function requestJson(port, pathname, { method = 'POST', origin = allowedHttpOrigin, cookie, body } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers,
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
  });
  const text = await response.text();
  return {
    response,
    json: text ? JSON.parse(text) : {}
  };
}

function connectWebSocket(port, { origin = allowedHttpOrigin, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
      origin,
      headers: cookie ? { Cookie: cookie } : {}
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitForMqttMessage(socket, topic, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for WS mqtt-message on ${topic}`));
    }, timeoutMs);
    const onMessage = (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.type === 'mqtt-message' && msg.topic === topic) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(msg);
      }
    };
    socket.on('message', onMessage);
  });
}

test('hardware endpoints enforce auth, visitor RBAC, Origin CSRF checks, payload validation, and offline 503', async () => {
  const port = await getAvailablePort();
  const appDataDir = mkdtempSync(path.join(os.tmpdir(), 'fault-iot-hw-offline-'));
  const server = startBridge({
    appDataDir,
    port,
    username: 'hwadmin',
    password: 'StrongPassword123'
  });

  try {
    assert.equal(await waitForHealth(port), true);

    assert.equal((await requestJson(port, '/api/hardware/state', { method: 'GET' })).response.status, 401);
    assert.equal((await requestJson(port, '/api/devices/command', { body: { deviceId: 'living_light', targetState: true } })).response.status, 401);

    const adminLogin = await requestJson(port, '/api/auth/login', {
      body: { username: 'hwadmin', password: 'StrongPassword123' }
    });
    assert.equal(adminLogin.response.status, 200);
    const adminCookie = adminLogin.response.headers.get('set-cookie').split(';')[0];

    const createVisitor = await requestJson(port, '/api/admin/users', {
      cookie: adminCookie,
      body: { username: 'hwvisitor', password: 'VisitorPass123' }
    });
    assert.equal(createVisitor.response.status, 201);

    const visitorLogin = await requestJson(port, '/api/auth/login', {
      body: { username: 'hwvisitor', password: 'VisitorPass123' }
    });
    assert.equal(visitorLogin.response.status, 200);
    const visitorCookie = visitorLogin.response.headers.get('set-cookie').split(';')[0];

    const visitorState = await requestJson(port, '/api/hardware/state', { method: 'GET', cookie: visitorCookie });
    assert.equal(visitorState.response.status, 200);
    assert.equal(visitorState.json.brokerConnected, false);
    assert.equal(visitorState.json.snapshot, null);

    const visitorCommand = await requestJson(port, '/api/devices/command', {
      cookie: visitorCookie,
      body: { deviceId: 'living_light', targetState: true }
    });
    assert.equal(visitorCommand.response.status, 403);

    const badOrigin = await requestJson(port, '/api/devices/command', {
      origin: 'http://evil.example',
      cookie: adminCookie,
      body: { deviceId: 'living_light', targetState: true }
    });
    assert.equal(badOrigin.response.status, 403);

    const unknownDevice = await requestJson(port, '/api/devices/command', {
      cookie: adminCookie,
      body: { deviceId: 'non_existent_relay', targetState: true }
    });
    assert.equal(unknownDevice.response.status, 400);

    const badState = await requestJson(port, '/api/devices/command', {
      cookie: adminCookie,
      body: { deviceId: 'door_nfc', targetState: 'BLINK' }
    });
    assert.equal(badState.response.status, 400);

    const brokerOffline = await requestJson(port, '/api/devices/command', {
      cookie: adminCookie,
      body: { deviceId: 'living_light', targetState: true }
    });
    assert.equal(brokerOffline.response.status, 503);
  } finally {
    await stopBridge(server.child);
  }
});

test('bridge relays live MQTT hardware telemetry/state ACKs and publishes QoS 1 device commands', { skip: !opensslAvailable }, async () => {
  const bridgePort = await getAvailablePort();
  const brokerPort = await getAvailablePort();
  const appDataDir = mkdtempSync(path.join(os.tmpdir(), 'fault-iot-hw-live-'));
  const certPath = path.join(appDataDir, 'broker.crt');
  const keyPath = path.join(appDataDir, 'broker.key');

  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath,
    '-out', certPath,
    '-days', '1',
    '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1'
  ], { stdio: 'ignore' });

  const broker = createMockWssMqttBroker({
    cert: readFileSync(certPath),
    key: readFileSync(keyPath)
  });
  await new Promise((resolve) => broker.httpsServer.listen(brokerPort, '127.0.0.1', resolve));

  const server = startBridge({
    appDataDir,
    port: bridgePort,
    username: 'hwadmin',
    password: 'StrongPassword123',
    brokerUrl: `wss://127.0.0.1:${brokerPort}`,
    brokerCaPath: certPath
  });

  let wsClient;
  try {
    assert.equal(await waitForHealth(bridgePort), true);
    await broker.waitUntilSubscribed();

    const adminLogin = await requestJson(bridgePort, '/api/auth/login', {
      body: { username: 'hwadmin', password: 'StrongPassword123' }
    });
    assert.equal(adminLogin.response.status, 200);
    const adminCookie = adminLogin.response.headers.get('set-cookie').split(';')[0];

    wsClient = await connectWebSocket(bridgePort, { cookie: adminCookie });

    const telemetryWaiter = waitForMqttMessage(wsClient, 'home/esp32/telemetry');
    const telemetryPayload = {
      schema_version: 1,
      source: 'Hardware',
      device_id: 'aabbccddeeff',
      uptimeMs: 42000,
      dht11: { valid: true, temperature: 29.1, humidity: 64.0, pin: 4 },
      mq2: { valid: true, preheating: false, smoke: 'NORMAL', rawMv: 410, scaledMv: 410, smokePercent: 5, pin: 1 },
      devices: {
        living_light: false,
        bedroom_light: false,
        kitchen_light: false,
        hallway_light: false,
        door_nfc: 'LOCKED',
        living_fan: false
      }
    };
    broker.sendBrokerMessage('home/esp32/telemetry', telemetryPayload);
    const wsTelemetry = await telemetryWaiter;
    assert.equal(wsTelemetry.payload.dht11.temperature, 29.1);
    assert.equal(wsTelemetry.payload.dht11.humidity, 64.0);

    const cmdRes = await requestJson(bridgePort, '/api/devices/command', {
      cookie: adminCookie,
      body: { deviceId: 'door_nfc', targetState: true }
    });
    assert.equal(cmdRes.response.status, 200);
    assert.equal(cmdRes.json.mqttPublished, true);
    assert.equal(cmdRes.json.targetState, 'UNLOCKED');
    assert.equal(cmdRes.json.topic, 'home/hallway/lock/door_nfc/set');

    assert.equal(broker.publishedCommands.length, 1);
    assert.equal(broker.publishedCommands[0].topic, 'home/hallway/lock/door_nfc/set');
    assert.equal(broker.publishedCommands[0].payload.targetState, 'UNLOCKED');
    assert.equal(broker.publishedCommands[0].payload.requestedBy, 'hwadmin');

    const ackWaiter = waitForMqttMessage(wsClient, 'home/hallway/lock/door_nfc/state');
    broker.sendBrokerMessage('home/hallway/lock/door_nfc/state', {
      commandId: cmdRes.json.commandId,
      deviceId: 'door_nfc',
      zoneId: 'hallway',
      state: 'UNLOCKED',
      status: 'SUCCESS',
      hardwarePin: 8,
      source: 'Hardware',
      timestampMs: Date.now()
    });
    const wsAck = await ackWaiter;
    assert.equal(wsAck.payload.state, 'UNLOCKED');

    const cachedState = await requestJson(bridgePort, '/api/hardware/state', {
      method: 'GET',
      cookie: adminCookie
    });
    assert.equal(cachedState.response.status, 200);
    assert.equal(cachedState.json.brokerConnected, true);
    assert.equal(cachedState.json.snapshot.dht11.humidity, 64.0);
    assert.equal(cachedState.json.snapshot.devices.door_nfc, 'UNLOCKED');
    assert.equal(cachedState.json.deviceStates.door_nfc.status, 'SUCCESS');
  } finally {
    if (wsClient) wsClient.close();
    await stopBridge(server.child);
    broker.wss.close();
    await new Promise((resolve) => broker.httpsServer.close(resolve));
  }
});
