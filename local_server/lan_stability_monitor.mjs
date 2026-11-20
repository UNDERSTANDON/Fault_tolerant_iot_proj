import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const TEST_TOPIC = 'demo/esp32-mqtt-connectivity/test';
const STALE_AFTER_MS = 70000;
const DEFAULT_DURATION_MINUTES = 30;
const DEFAULT_SAMPLE_SECONDS = 10;

function parseArguments(args) {
  const options = {
    durationMinutes: DEFAULT_DURATION_MINUTES,
    sampleSeconds: DEFAULT_SAMPLE_SECONDS
  };

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!['--duration-minutes', '--sample-seconds'].includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }

    const value = Number(args[index + 1]);
    if (!Number.isInteger(value)) {
      throw new Error(`Expected an integer after ${option}.`);
    }
    if (option === '--duration-minutes') {
      options.durationMinutes = value;
    } else {
      options.sampleSeconds = value;
    }
    index += 1;
  }

  if (options.durationMinutes < 1 || options.durationMinutes > 240) {
    throw new Error('--duration-minutes must be between 1 and 240.');
  }
  if (options.sampleSeconds < 5 || options.sampleSeconds > 60) {
    throw new Error('--sample-seconds must be between 5 and 60.');
  }

  return options;
}

function expandEnvironmentVariables(value) {
  return value.replace(/%([^%]+)%/g, (match, name) => {
    const environmentValue = Object.entries(process.env)
      .find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
    return environmentValue ?? match;
  });
}

function isPrivateIPv4(host) {
  if (net.isIP(host) !== 4) {
    return false;
  }
  const [first, second] = host.split('.').map(Number);
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function loadConfiguration() {
  const host = process.env.BRIDGE_HOST || '';
  if (!isPrivateIPv4(host)) {
    throw new Error('BRIDGE_HOST must be the current private IPv4 hotspot address.');
  }

  const bridgePort = Number(process.env.BRIDGE_PORT || 8081);
  if (!Number.isInteger(bridgePort) || bridgePort < 1 || bridgePort > 65535) {
    throw new Error('BRIDGE_PORT must be a valid TCP port.');
  }

  const allowedOrigins = (process.env.BRIDGE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const dashboardOrigin = allowedOrigins.find((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === 'https:' && parsed.hostname === host;
    } catch {
      return false;
    }
  });
  if (!dashboardOrigin) {
    throw new Error('BRIDGE_ALLOWED_ORIGINS must contain the HTTPS origin for BRIDGE_HOST.');
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error('LOCALAPPDATA is not set; run this test from the configured Windows account.');
  }
  const defaultSecretsDirectory = path.join(localAppData, 'FaultTolerantIoT', 'mosquitto');
  const credentialsPath = expandEnvironmentVariables(
    process.env.LOCAL_BROKER_CREDENTIALS
      || path.join(defaultSecretsDirectory, 'bridge.env')
  );
  const credentials = dotenv.parse(readFileSync(credentialsPath));
  const username = (process.env.LOCAL_AUTH_ADMIN_USERNAME || '').trim();
  const password = process.env.LOCAL_AUTH_ADMIN_PASSWORD || '';
  if (!username || !password) {
    throw new Error('Set LOCAL_AUTH_ADMIN_USERNAME and LOCAL_AUTH_ADMIN_PASSWORD in the current terminal for authenticated bridge checks.');
  }

  const caPath = expandEnvironmentVariables(
    process.env.BROKER_CA_PATH
      || credentials.BROKER_CA_PATH
      || path.join(defaultSecretsDirectory, 'certs', 'ca.crt')
  );
  const ca = readFileSync(caPath);

  return {
    host,
    bridgePort,
    username,
    password,
    origin: dashboardOrigin,
    dashboardUrl: new URL('/', dashboardOrigin),
    bridgeUrl: `wss://${host}:${bridgePort}`,
    authUrl: `https://${host}:${bridgePort}`,
    ca
  };
}

function checkDashboard(url, ca) {
  return new Promise((resolve) => {
    const request = https.get(url, {
      ca,
      rejectUnauthorized: true,
      timeout: 10000
    }, (response) => {
      const statusCode = response.statusCode || 0;
      response.resume();
      resolve({
        ok: statusCode === 200,
        statusCode
      });
    });

    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', () => resolve({ ok: false, statusCode: 0 }));
  });
}

function waitForSocketOpen(socket, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('websocket_open_timeout')), timeoutMs);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('error', () => {
      clearTimeout(timer);
      reject(new Error('websocket_connection_error'));
    });
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      reject(new Error(`websocket_http_${response.statusCode || 0}`));
    });
  });
}

function waitForSocketMessage(socket, expectedType, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`${expectedType}_timeout`));
    }, timeoutMs);

    function onMessage(raw) {
      let message;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }
      if (message.type !== expectedType) {
        return;
      }
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    }

    socket.on('message', onMessage);
    socket.once('error', () => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      reject(new Error('websocket_connection_error'));
    });
  });
}

async function loginToBridge(config) {
  const response = await new Promise((resolve, reject) => {
    const request = https.request(
      `${config.authUrl}/api/auth/login`,
      {
        method: 'POST',
        ca: config.ca,
        rejectUnauthorized: true,
        headers: {
          'Content-Type': 'application/json'
        }
      },
      (incoming) => {
        const chunks = [];
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: incoming.statusCode || 0,
            headers: incoming.headers,
            body: text
          });
        });
      }
    );

    request.on('error', reject);
    request.write(JSON.stringify({ username: config.username, password: config.password }));
    request.end();
  });

  if (response.statusCode !== 200) {
    throw new Error(`Bridge login failed with HTTP ${response.statusCode}: ${response.body}`);
  }

  const setCookieHeader = response.headers['set-cookie'];
  if (!setCookieHeader) {
    throw new Error('Bridge login did not return a session cookie.');
  }

  return Array.isArray(setCookieHeader) ? setCookieHeader[0].split(';')[0] : String(setCookieHeader).split(';')[0];
}

async function verifySessionRequired(config) {
  return await new Promise((resolve) => {
    const socket = new WebSocket(config.bridgeUrl, {
      ca: config.ca,
      origin: config.origin,
      rejectUnauthorized: true,
      handshakeTimeout: 10000,
      headers: {}
    });

    const finish = (value) => {
      socket.close();
      resolve(value);
    };

    socket.once('unexpected-response', () => finish(true));
    socket.once('error', () => finish(true));
    socket.once('open', () => finish(false));
    setTimeout(() => finish(false), 3000);
  });
}

function isValidTestMessage(message) {
  const payload = message.payload;
  return message.topic === TEST_TOPIC
    && payload !== null
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && payload.schema_version === 1
    && payload.kind === 'connectivity_test'
    && typeof payload.device_id === 'string'
    && /^[0-9a-f]{12}$/i.test(payload.device_id)
    && Number.isSafeInteger(payload.sequence)
    && payload.sequence > 0;
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function formatAge(timestamp, now) {
  if (timestamp === null) {
    return '';
  }
  return Math.max(0, (now - timestamp) / 1000).toFixed(1);
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const config = loadConfiguration();
  const outputDirectory = path.join(
    process.env.LOCALAPPDATA,
    'FaultTolerantIoT',
    'test-runs'
  );
  mkdirSync(outputDirectory, { recursive: true });

  const startedAt = new Date();
  const runId = startedAt.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const csvPath = path.join(outputDirectory, `lan-stability-${runId}.csv`);
  const summaryPath = path.join(outputDirectory, `lan-stability-${runId}-summary.txt`);
  const csv = createWriteStream(csvPath, { flags: 'wx', encoding: 'utf8' });
  csv.write([
    'timestamp',
    'dashboard_https_ok',
    'dashboard_http_status',
    'bridge_socket_state',
    'browser_authenticated',
    'topic_allowlist_verified',
    'broker_state',
    'last_test_message_age_seconds',
    'test_message_stale',
    'test_messages_total',
    'bridge_reconnects',
    'error_code'
  ].join(',') + '\r\n');

  const state = {
    socket: null,
    socketState: 'disconnected',
    authenticated: false,
    topicAllowlistVerified: false,
    brokerState: 'unknown',
    lastMessageAt: null,
    messages: 0,
    reconnects: 0,
    authenticatedSessions: 0,
    lastPongAt: null,
    brokerConnectedSeen: false,
    stop: false,
    lastErrorCode: '',
    reconnectTimer: null
  };
  let sessionRequiredRejected = false;
  let dashboardChecks = 0;
  let dashboardFailures = 0;
  let staleSamples = 0;
  let bridgeDisconnectedSamples = 0;
  let brokerUnavailableSamples = 0;
  let samples = 0;
  let completed = false;
  let finalSocketState = 'disconnected';
  let finalAuthenticated = false;
  let finalTopicAllowlistVerified = false;
  let finalBrokerState = 'unknown';
  let finalLastMessageAt = null;

  const shutdown = () => {
    state.stop = true;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }
    if (state.socket && state.socket.readyState < WebSocket.CLOSING) {
      state.socket.close(1000, 'Test finished');
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  function scheduleReconnect() {
    if (state.stop || state.reconnectTimer) {
      return;
    }
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connectBridge();
    }, 3000);
  }

  function connectBridge() {
    if (state.stop) {
      return;
    }
    if (state.authenticatedSessions > 0) {
      state.reconnects += 1;
    }
    state.socketState = 'connecting';
    state.authenticated = false;
    state.topicAllowlistVerified = false;
    state.brokerState = 'unknown';

    const socket = new WebSocket(config.bridgeUrl, {
      ca: config.ca,
      origin: config.origin,
      rejectUnauthorized: true,
      handshakeTimeout: 10000,
      headers: config.sessionCookie ? { Cookie: config.sessionCookie } : {}
    });
    state.socket = socket;

    socket.on('open', () => {
      state.socketState = 'authenticating';
      socket.send(JSON.stringify({ type: 'authenticate' }));
    });

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch {
        state.lastErrorCode = 'invalid_bridge_json';
        return;
      }

      if (message.type === 'authenticated') {
        state.authenticated = true;
        state.socketState = 'connected';
        state.authenticatedSessions += 1;
        state.lastPongAt = Date.now();
        socket.send(JSON.stringify({ type: 'subscribe' }));
        return;
      }
      if (message.type === 'subscribed') {
        const topics = Array.isArray(message.topics) ? message.topics : [];
        state.topicAllowlistVerified = topics.length === 1 && topics[0] === TEST_TOPIC;
        if (!state.topicAllowlistVerified) {
          state.lastErrorCode = 'unexpected_topic_allowlist';
        }
        return;
      }
      if (message.type === 'authentication-error') {
        state.lastErrorCode = 'browser_authentication_rejected';
        return;
      }
      if (message.type === 'status') {
        state.brokerState = typeof message.state === 'string' ? message.state : 'unknown';
        if (state.brokerState === 'connected') {
          state.brokerConnectedSeen = true;
        }
        return;
      }
      if (message.type === 'mqtt-message') {
        if (!isValidTestMessage(message)) {
          state.lastErrorCode = 'invalid_connectivity_test_message';
          return;
        }
        state.messages += 1;
        state.lastMessageAt = Date.now();
        return;
      }
      if (message.type === 'pong') {
        state.lastPongAt = Date.now();
        return;
      }
      if (message.type === 'error') {
        state.lastErrorCode = 'bridge_protocol_error';
      }
    });

    socket.on('error', () => {
      state.lastErrorCode = 'websocket_connection_error';
    });

    socket.on('close', () => {
      if (state.socket === socket) {
        state.socket = null;
        state.socketState = 'disconnected';
        state.authenticated = false;
        state.brokerState = 'unknown';
      }
      scheduleReconnect();
    });
  }

  const heartbeatTimer = setInterval(() => {
    if (!state.authenticated || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (state.lastPongAt !== null && Date.now() - state.lastPongAt > 45000) {
      state.lastErrorCode = 'bridge_heartbeat_timeout';
      state.socket.terminate();
      return;
    }
    state.socket.send(JSON.stringify({ type: 'ping' }));
  }, 15000);

  try {
    const dashboardInitial = await checkDashboard(config.dashboardUrl, config.ca);
    dashboardChecks += 1;
    dashboardFailures += Number(!dashboardInitial.ok);
    if (!dashboardInitial.ok) {
      throw new Error('Dashboard HTTPS preflight failed. Check the service, certificate SAN, and local CA.');
    }

    config.sessionCookie = await loginToBridge(config);
    sessionRequiredRejected = await verifySessionRequired(config);
    if (!sessionRequiredRejected) {
      throw new Error('The bridge accepted a connection without a session cookie.');
    }

    connectBridge();
    console.log(`Starting ${options.durationMinutes}-minute LAN stability run.`);
    console.log('Keep the phone dashboard open during the test; this monitor cannot inspect the phone UI.');
    console.log('No services will be restarted automatically.');
    console.log(`CSV: ${csvPath}`);
    console.log(`Summary: ${summaryPath}`);

    const durationMs = options.durationMinutes * 60 * 1000;
    const sampleIntervalMs = options.sampleSeconds * 1000;
    const monitoringStartedAt = Date.now();
    const deadline = Date.now() + durationMs;
    const warmupDeadline = Date.now() + STALE_AFTER_MS;

    while (!state.stop && Date.now() < deadline) {
      const sampleStartedAt = Date.now();
      const dashboard = await checkDashboard(config.dashboardUrl, config.ca);
      dashboardChecks += 1;
      dashboardFailures += Number(!dashboard.ok);
      samples += 1;

      const messageAge = state.lastMessageAt === null
        ? null
        : sampleStartedAt - state.lastMessageAt;
      const messageStale = sampleStartedAt >= warmupDeadline
        && (messageAge === null || messageAge > STALE_AFTER_MS);
      staleSamples += Number(messageStale);
      const socketConnected = state.socketState === 'connected' && state.authenticated;
      const startupSettled = sampleStartedAt - monitoringStartedAt >= 30000;
      if (startupSettled) {
        bridgeDisconnectedSamples += Number(!socketConnected);
        brokerUnavailableSamples += Number(state.brokerState !== 'connected');
      }
      const errorCode = dashboard.ok
        ? state.lastErrorCode
        : 'dashboard_https_check_failed';

      csv.write([
        csvCell(new Date(sampleStartedAt).toISOString()),
        csvCell(dashboard.ok),
        csvCell(dashboard.statusCode),
        csvCell(state.socketState),
        csvCell(state.authenticated),
        csvCell(state.topicAllowlistVerified),
        csvCell(state.brokerState),
        csvCell(formatAge(state.lastMessageAt, sampleStartedAt)),
        csvCell(messageStale),
        csvCell(state.messages),
        csvCell(state.reconnects),
        csvCell(errorCode)
      ].join(',') + '\r\n');

      const elapsedMinutes = Math.floor((sampleStartedAt - (deadline - durationMs)) / 60000);
      console.log(
        `${new Date(sampleStartedAt).toLocaleTimeString()} `
        + `elapsed=${elapsedMinutes}m `
        + `HTTPS=${dashboard.statusCode || 'failed'} `
        + `WSS=${socketConnected ? 'connected' : state.socketState} `
        + `broker=${state.brokerState} `
        + `testMessages=${state.messages} `
        + `stale=${messageStale}`
      );

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(sampleIntervalMs, remainingMs)));
    }

    completed = !state.stop && Date.now() >= deadline;
  } finally {
    finalSocketState = state.socketState;
    finalAuthenticated = state.authenticated;
    finalTopicAllowlistVerified = state.topicAllowlistVerified;
    finalBrokerState = state.brokerState;
    finalLastMessageAt = state.lastMessageAt;
    shutdown();
    clearInterval(heartbeatTimer);
    await new Promise((resolve) => csv.end(resolve));
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);

    const lastMessageAge = finalLastMessageAt === null
      ? null
      : Date.now() - finalLastMessageAt;
    const finalHealthy = finalSocketState === 'connected'
      && finalAuthenticated
      && finalTopicAllowlistVerified
      && finalBrokerState === 'connected'
      && lastMessageAge !== null
      && lastMessageAge <= STALE_AFTER_MS;
    const outcome = completed
      && dashboardFailures === 0
      && sessionRequiredRejected
      && state.authenticatedSessions > 0
      && state.topicAllowlistVerified
      && state.brokerConnectedSeen
      && state.messages > 0
      && staleSamples === 0
      && bridgeDisconnectedSamples === 0
      && brokerUnavailableSamples === 0
      && state.reconnects === 0
      && !state.lastErrorCode
      ? 'PASS'
      : (completed
        && sessionRequiredRejected
        && state.authenticatedSessions > 0
        && state.topicAllowlistVerified
        && state.brokerConnectedSeen
        && finalHealthy
        && state.messages > 0
        ? 'RECOVERED_WITH_INTERRUPTION_OR_CHECK_FAILURES'
        : 'INCOMPLETE_OR_FAILED');
    const summary = [
      `LAN dashboard stability test: ${outcome}`,
      `Started: ${startedAt.toISOString()}`,
      `Finished: ${new Date().toISOString()}`,
      `Requested duration (minutes): ${options.durationMinutes}`,
      `Completed full duration: ${completed}`,
      `Dashboard HTTPS checks: ${dashboardChecks}`,
      `Monitoring samples: ${samples}`,
      `Dashboard HTTPS failures: ${dashboardFailures}`,
      `Bridge-disconnected samples: ${bridgeDisconnectedSamples}`,
      `Broker-unavailable samples: ${brokerUnavailableSamples}`,
      `Session required: ${sessionRequiredRejected}`,
      `Authenticated bridge sessions: ${state.authenticatedSessions}`,
      `Allowed topic confirmed: ${state.topicAllowlistVerified}`,
      `Bridge reconnects: ${state.reconnects}`,
      `Broker connected status observed: ${state.brokerConnectedSeen}`,
      `ESP32 connectivity-test messages received: ${state.messages}`,
      `Stale samples after ${STALE_AFTER_MS / 1000}s warm-up: ${staleSamples}`,
      `Last monitor error code: ${state.lastErrorCode || 'none'}`,
      `Final bridge/broker/message state healthy: ${finalHealthy}`,
      'Phone UI state and phone certificate trust are not observable by this laptop-side monitor.',
      'The test validates only the connectivity-test topic; it does not exercise sensors, commands, or unintended-network isolation.',
      `CSV report: ${csvPath}`
    ].join(os.EOL) + os.EOL;
    await import('node:fs/promises').then(({ writeFile }) => writeFile(summaryPath, summary, 'utf8'));
    console.log(summary);
    if (outcome === 'INCOMPLETE_OR_FAILED') {
      process.exitCode = 1;
    }
  }

}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
