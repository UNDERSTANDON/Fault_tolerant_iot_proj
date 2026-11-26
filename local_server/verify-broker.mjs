import { readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mqtt from 'mqtt';

const credentialsPath = process.env.LOCAL_BROKER_CREDENTIALS
  || path.join(process.env.LOCALAPPDATA || '', 'FaultTolerantIoT', 'mosquitto', 'bridge.env');
dotenv.config({ path: credentialsPath, override: true });

const ca = readFileSync(process.env.BROKER_CA_PATH);
const tlsUrl = process.env.MQTT_TLS_URL;
const wssUrl = process.env.BROKER_URL;
const commonOptions = {
  ca,
  rejectUnauthorized: true,
  reconnectPeriod: 0,
  connectTimeout: 5000,
  protocolVersion: 4
};

function connect(url, credentials) {
  return mqtt.connectAsync(url, {
    ...commonOptions,
    username: credentials.username,
    password: credentials.password
  });
}

function close(client) {
  return new Promise((resolve) => client.end(false, {}, resolve));
}

function waitForMessage(client, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for broker delivery')), timeoutMs);
    client.once('message', (topic, payload) => {
      clearTimeout(timer);
      resolve({ topic, payload: payload.toString('utf8') });
    });
  });
}

async function assertRejectedConnection(url) {
  const badClient = mqtt.connect(url, {
    ...commonOptions,
    username: 'invalid_test_identity',
    password: 'invalid_test_password'
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Invalid credentials unexpectedly connected')), 5000);
      badClient.once('connect', () => {
        clearTimeout(timer);
        reject(new Error('Invalid credentials unexpectedly connected'));
      });
      badClient.once('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  } finally {
    badClient.end(true);
  }
}

async function assertWriteOnlyIdentityDoesNotReceive() {
  const client = await connect(tlsUrl, {
    username: 'esp32_test',
    password: process.env.ESP32_MQTT_PASSWORD
  });
  try {
    const topic = 'demo/esp32-mqtt-connectivity/test';
    await client.subscribeAsync(topic, { qos: 1 });
    const messageResult = waitForMessage(client, 750)
      .then((message) => ({ received: true, message }))
      .catch(() => ({ received: false }));
    await client.publishAsync(topic, JSON.stringify({
      schema_version: 1,
      kind: 'connectivity_test',
      device_id: 'aabbccddeeff',
      sequence: Date.now()
    }), { qos: 1 });

    const result = await messageResult;
    if (result.received) {
      throw new Error('The publisher identity received a message on a write-only topic');
    }
  } finally {
    await close(client);
  }
}

async function assertBridgeIdentityCannotPublish() {
  const client = await connect(wssUrl, {
    username: 'dashboard_bridge',
    password: process.env.BROKER_PASSWORD
  });
  try {
    const topic = 'demo/esp32-mqtt-connectivity/test';
    await client.subscribeAsync(topic, { qos: 1 });
    const messageResult = waitForMessage(client, 750)
      .then((message) => ({ received: true, message }))
      .catch(() => ({ received: false }));
    await client.publishAsync(topic, JSON.stringify({
      schema_version: 1,
      kind: 'connectivity_test',
      device_id: 'aabbccddeeff',
      sequence: Date.now()
    }), { qos: 1 });

    const result = await messageResult;
    if (result.received) {
      throw new Error('The bridge identity published to a read-only topic');
    }
  } finally {
    await close(client);
  }
}

async function assertPublisherCannotReadSyntheticTopic() {
  const client = await connect(tlsUrl, {
    username: 'esp32_test',
    password: process.env.ESP32_MQTT_PASSWORD
  });
  try {
    const grants = await client.subscribeAsync('test/esp32/notifications/v1', { qos: 1 });
    if (grants.length !== 1 || grants[0].qos !== 128) {
      throw new Error('The publisher identity received read access to the synthetic event topic');
    }
  } finally {
    await close(client);
  }
}

async function assertBridgeIdentityCannotPublishSyntheticTopic() {
  const client = await connect(wssUrl, {
    username: 'dashboard_bridge',
    password: process.env.BROKER_PASSWORD
  });
  try {
    const topic = 'test/esp32/notifications/v1';
    await client.subscribeAsync(topic, { qos: 1 });
    const messageResult = waitForMessage(client, 750)
      .then((message) => ({ received: true, message }))
      .catch(() => ({ received: false }));
    await client.publishAsync(topic, JSON.stringify({
      schema_version: 1,
      kind: 'synthetic_notification',
      is_test: true
    }), { qos: 1 });
    if ((await messageResult).received) {
      throw new Error('The bridge identity published to the synthetic event topic');
    }
  } finally {
    await close(client);
  }
}

async function assertSyntheticEventCrossListenerDelivery() {
  const topic = 'test/esp32/notifications/v1';
  const subscriber = await connect(wssUrl, {
    username: 'dashboard_bridge',
    password: process.env.BROKER_PASSWORD
  });
  try {
    await subscriber.subscribeAsync(topic, { qos: 1 });
    const received = waitForMessage(subscriber, 5000);
    const publisher = await connect(tlsUrl, {
      username: 'esp32_test',
      password: process.env.ESP32_MQTT_PASSWORD
    });
    try {
      const expected = JSON.stringify({
        schema_version: 1,
        kind: 'synthetic_notification',
        is_test: true,
        event_id: 'aabbccddeeff-0011223344556677-1',
        source: 'esp32_mock',
        device_id: 'aabbccddeeff',
        test_run_id: '0011223344556677',
        sequence: 1,
        severity: 'warning',
        title: 'Synthetic warning test event',
        message: 'Generated test notification; no physical sensor is represented.',
        timestamp_ms: 1234,
        timestamp_kind: 'device_uptime_ms'
      });
      await publisher.publishAsync(topic, expected, { qos: 1 });
      const message = await received;
      if (message.topic !== topic || message.payload !== expected) {
        throw new Error('Broker delivered a synthetic event with an unexpected topic or payload');
      }
    } finally {
      await close(publisher);
    }
  } finally {
    await close(subscriber);
  }
}

async function assertCrossListenerDelivery() {
  const subscriber = await connect(wssUrl, {
    username: 'dashboard_bridge',
    password: process.env.BROKER_PASSWORD
  });

  try {
    await subscriber.subscribeAsync('demo/esp32-mqtt-connectivity/test', { qos: 1 });
    const received = waitForMessage(subscriber, 5000);
    const publisher = await connect(tlsUrl, {
      username: 'esp32_test',
      password: process.env.ESP32_MQTT_PASSWORD
    });

    try {
      const expected = JSON.stringify({
        schema_version: 1,
        kind: 'connectivity_test',
        device_id: 'aabbccddeeff',
        sequence: Date.now()
      });
      await publisher.publishAsync('demo/esp32-mqtt-connectivity/test', expected, { qos: 1 });
      const message = await received;
      if (message.topic !== 'demo/esp32-mqtt-connectivity/test' || message.payload !== expected) {
        throw new Error('Broker delivered a message with an unexpected topic or payload');
      }
    } finally {
      await close(publisher);
    }
  } finally {
    await close(subscriber);
  }
}

async function main() {
  if (!tlsUrl || !wssUrl || !process.env.BROKER_CA_PATH
      || !process.env.BROKER_USERNAME || !process.env.BROKER_PASSWORD
      || !process.env.ESP32_MQTT_PASSWORD) {
    throw new Error(`Broker credentials/config are incomplete: ${credentialsPath}`);
  }

  await assertRejectedConnection(tlsUrl);
  console.log('PASS invalid credentials rejected over MQTT/TLS');
  await assertRejectedConnection(wssUrl);
  console.log('PASS invalid credentials rejected over WSS');
  await assertWriteOnlyIdentityDoesNotReceive();
  console.log('PASS publisher identity cannot read its write-only topic');
  await assertBridgeIdentityCannotPublish();
  console.log('PASS bridge identity cannot publish to its read-only topic');
  await assertPublisherCannotReadSyntheticTopic();
  console.log('PASS publisher identity cannot read the synthetic event topic');
  await assertBridgeIdentityCannotPublishSyntheticTopic();
  console.log('PASS bridge identity cannot publish to the synthetic event topic');
  await assertSyntheticEventCrossListenerDelivery();
  console.log('PASS synthetic event delivery across MQTT/TLS and WSS listeners');
  await assertCrossListenerDelivery();
  console.log('PASS authenticated MQTT/TLS publish reached the WSS subscriber');
}

main().catch((error) => {
  console.error('Broker verification failed:', error.message);
  process.exitCode = 1;
});
