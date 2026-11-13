import { WebSocketServer } from 'ws';
import mqtt from 'mqtt';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });
if (process.env.LOCAL_BROKER_CREDENTIALS) {
  dotenv.config({ path: process.env.LOCAL_BROKER_CREDENTIALS, override: true });
}

const config = {
  brokerUrl: process.env.BROKER_URL || 'wss://localhost:8084',
  brokerUsername: process.env.BROKER_USERNAME || '',
  brokerPassword: process.env.BROKER_PASSWORD || '',
  brokerCaPath: process.env.BROKER_CA_PATH || '',
  bridgeHost: process.env.BRIDGE_HOST || '127.0.0.1',
  bridgePort: Number(process.env.BRIDGE_PORT || 8081),
  allowedTopics: ['demo/esp32-mqtt-connectivity/test']
};
const allowedOrigins = new Set(
  (process.env.BRIDGE_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const messageClients = new Set();
const MAX_BROKER_MESSAGE_BYTES = 2048;

const isAllowedTopic = (topic) => {
  return config.allowedTopics.includes(topic);
};

const buildConnectionOptions = () => {
  const options = {
    protocol: 'wss',
    clientId: `local-bridge-${Date.now()}`,
    reconnectPeriod: 5000,
    rejectUnauthorized: true,
    clean: true,
    keepalive: 30,
    resubscribe: true
  };

  if (config.brokerUsername) {
    options.username = config.brokerUsername;
  }

  if (config.brokerPassword) {
    options.password = config.brokerPassword;
  }

  if (config.brokerCaPath) {
    options.ca = readFileSync(config.brokerCaPath);
  }

  return options;
};

const sendStatus = (status, detail) => {
  for (const client of messageClients) {
    if (client.readyState !== client.OPEN) {
      messageClients.delete(client);
      continue;
    }

    client.send(JSON.stringify({
      type: 'status',
      state: status,
      detail,
      time: new Date().toISOString()
    }));
  }
};

const sendPayload = (topic, payload) => {
  if (!isAllowedTopic(topic) || !isValidTestPayload(payload)) {
    console.warn(`Rejected invalid or unexpected broker payload on ${topic}`);
    return;
  }

  const envelope = {
    type: 'mqtt-message',
    topic,
    payload,
    receivedAt: new Date().toISOString()
  };

  for (const client of messageClients) {
    if (client.readyState !== client.OPEN) {
      messageClients.delete(client);
      continue;
    }

    client.send(JSON.stringify(envelope));
  }
};

function isValidTestPayload(payload) {
  return payload !== null
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && payload.schema_version === 1
    && payload.kind === 'connectivity_test'
    && typeof payload.device_id === 'string'
    && /^[0-9a-f]{12}$/i.test(payload.device_id)
    && Number.isSafeInteger(payload.sequence)
    && payload.sequence > 0;
}

const brokerClient = mqtt.connect(config.brokerUrl, buildConnectionOptions());

brokerClient.on('connect', () => {
  console.log(`MQTT broker connected: ${config.brokerUrl}`);
  sendStatus('connected', 'MQTT broker reachable');

  for (const topic of config.allowedTopics) {
    brokerClient.subscribe(topic, { qos: 0 }, (error) => {
      if (error) {
        console.error(`Failed to subscribe to ${topic}:`, error);
        return;
      }
      console.log(`Subscribed to ${topic}`);
    });
  }
});

brokerClient.on('reconnect', () => {
  console.warn('MQTT broker reconnecting ...');
  sendStatus('reconnecting', 'MQTT broker reconnect in progress');
});

brokerClient.on('error', (error) => {
  console.error('MQTT broker error:', error.message || error);
  sendStatus('unavailable', 'MQTT broker connection failed');
});

brokerClient.on('message', (topic, payloadBuffer) => {
  if (payloadBuffer.length > MAX_BROKER_MESSAGE_BYTES) {
    console.warn(`Rejected oversized broker payload on ${topic}`);
    return;
  }

  let payload;
  try {
    const text = payloadBuffer.toString('utf8');
    payload = JSON.parse(text);
  } catch (error) {
    payload = payloadBuffer.toString('utf8');
  }

  console.log(`Received on ${topic}`);
  sendPayload(topic, payload);
});

const wss = new WebSocketServer({
  host: config.bridgeHost,
  port: config.bridgePort,
  maxPayload: MAX_BROKER_MESSAGE_BYTES,
  verifyClient: (info) => {
    const origin = info.req.headers.origin;
    return typeof origin === 'string' && allowedOrigins.has(origin);
  }
});

wss.on('connection', (socket) => {
  messageClients.add(socket);
  socket.send(JSON.stringify({
    type: 'status',
    state: brokerClient.connected ? 'connected' : 'unavailable',
    detail: brokerClient.connected ? 'MQTT broker reachable' : 'MQTT broker unavailable',
    time: new Date().toISOString()
  }));

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString('utf8'));
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', time: new Date().toISOString() }));
        return;
      }
      if (message.type === 'subscribe') {
        socket.send(JSON.stringify({
          type: 'subscribed',
          topics: config.allowedTopics,
          time: new Date().toISOString()
        }));
        return;
      }
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Unsupported browser message',
        time: new Date().toISOString()
      }));
    } catch (error) {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Malformed browser payload',
        time: new Date().toISOString()
      }));
    }
  });

  socket.on('close', () => {
    messageClients.delete(socket);
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
    messageClients.delete(socket);
  });
});

console.log(`Local bridge listening on ws://${config.bridgeHost}:${config.bridgePort}`);
console.log(`Broker URL: ${config.brokerUrl}`);
