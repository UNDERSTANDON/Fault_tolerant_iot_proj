import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import mqtt from 'mqtt';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes, pbkdf2Sync, timingSafeEqual, createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  TEST_NOTIFICATION_TOPIC,
  TestEventDeliveryWorker,
  TestEventOutbox,
  validateTestNotification
} from './test_event_delivery.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });
if (process.env.LOCAL_BROKER_CREDENTIALS) {
  dotenv.config({ path: process.env.LOCAL_BROKER_CREDENTIALS, override: true });
}

const firestoreTestEnabledValue = process.env.FIRESTORE_TEST_ENABLED || 'false';
if (!['true', 'false'].includes(firestoreTestEnabledValue)) {
  throw new Error('FIRESTORE_TEST_ENABLED must be true or false.');
}
const firestoreTestEmulatorValue = process.env.FIRESTORE_TEST_EMULATOR || 'false';
if (!['true', 'false'].includes(firestoreTestEmulatorValue)) {
  throw new Error('FIRESTORE_TEST_EMULATOR must be true or false.');
}
if (firestoreTestEmulatorValue === 'true' && firestoreTestEnabledValue !== 'true') {
  throw new Error('FIRESTORE_TEST_EMULATOR requires FIRESTORE_TEST_ENABLED=true.');
}

const config = {
  brokerUrl: process.env.BROKER_URL || 'wss://localhost:8084',
  brokerUsername: process.env.BROKER_USERNAME || '',
  brokerPassword: process.env.BROKER_PASSWORD || '',
  brokerCaPath: process.env.BROKER_CA_PATH || '',
  bridgeHost: process.env.BRIDGE_HOST || '127.0.0.1',
  bridgePort: Number(process.env.BRIDGE_PORT || 8081),
  tlsCertPath: process.env.BRIDGE_TLS_CERT_PATH || '',
  tlsKeyPath: process.env.BRIDGE_TLS_KEY_PATH || '',
  allowedTopics: [
    'demo/esp32-mqtt-connectivity/test',
    ...(firestoreTestEnabledValue === 'true' ? [TEST_NOTIFICATION_TOPIC] : [])
  ],
  firestoreTestEnabled: firestoreTestEnabledValue === 'true',
  firestoreTestEmulator: firestoreTestEmulatorValue === 'true',
  firebaseTestProjectId: process.env.FIREBASE_TEST_PROJECT_ID || '',
  firebaseProductionProjectId: process.env.FIREBASE_PRODUCTION_PROJECT_ID || '',
  firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST || '',
  firebaseCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  allowedOrigins: new Set(
    (process.env.BRIDGE_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  ),
  sessionCookieName: 'fault_iot_session',
  sessionTtlMs: Number(process.env.LOCAL_AUTH_SESSION_TTL_MS || 1000 * 60 * 60 * 6),
  appDataDir: (() => {
    if (process.env.LOCALAPPDATA) {
      return path.join(process.env.LOCALAPPDATA, 'FaultTolerantIoT');
    }
    if (process.env.XDG_DATA_HOME) {
      return path.join(process.env.XDG_DATA_HOME, 'FaultTolerantIoT');
    }
    return path.join(os.homedir(), '.fault_tolerant_iot');
  })(),
};

const messageClients = new Set();
const MAX_BROKER_MESSAGE_BYTES = 2048;
const MAX_BROWSER_MESSAGE_BYTES = 512;
const BROWSER_AUTH_TIMEOUT_MS = 10000;
const isLoopbackBridge = ['localhost', '127.0.0.1', '::1'].includes(config.bridgeHost);
const useHttpsBridge = !isLoopbackBridge || Boolean(config.tlsCertPath || config.tlsKeyPath);
const serverDataDir = path.join(config.appDataDir, 'local-server');
const usersFile = path.join(serverDataDir, 'users.json');
const testEventOutbox = config.firestoreTestEnabled
  ? new TestEventOutbox(path.join(serverDataDir, 'test-event-outbox'))
  : null;
const sessionStore = new Map();
const loginAttempts = new Map();
let testEventOutboxReady = false;
let testFirebaseWriterReady = false;
let testEventWorker = null;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const HOME_TELEMETRY_TOPIC = 'home/esp32/telemetry';
const HOME_HEARTBEAT_TOPIC = 'home/gateway/heartbeat';
const HOME_CRITICAL_EVENT_TOPIC = 'home/events/critical';
const HOME_HARDWARE_TOPICS = [
  HOME_TELEMETRY_TOPIC,
  'home/+/telemetry',
  'home/+/+/+/state',
  HOME_HEARTBEAT_TOPIC,
  HOME_CRITICAL_EVENT_TOPIC
];
const HOME_TELEMETRY_TOPIC_REGEX = /^home\/[a-z0-9_-]+\/telemetry$/;
const HOME_STATE_TOPIC_REGEX = /^home\/(living_room|bedroom|kitchen|hallway|gateway)\/(light|lock|fan|device)\/[a-z0-9_]+\/state$/;

const DEVICE_COMMAND_ROUTES = {
  hallway_light: { zone: 'hallway', type: 'light', topic: 'home/hallway/light/hallway_light/set', isLock: false },
  door_nfc: { zone: 'hallway', type: 'lock', topic: 'home/hallway/lock/door_nfc/set', isLock: true },
  living_light: { zone: 'living_room', type: 'light', topic: 'home/living_room/light/living_light/set', isLock: false },
  living_fan: { zone: 'living_room', type: 'fan', topic: 'home/living_room/fan/living_fan/set', isLock: false },
  kitchen_light: { zone: 'kitchen', type: 'light', topic: 'home/kitchen/light/kitchen_light/set', isLock: false },
  bedroom_light: { zone: 'bedroom', type: 'light', topic: 'home/bedroom/light/bedroom_light/set', isLock: false }
};

const hardwareStateCache = {
  snapshot: null,
  snapshotReceivedAt: null,
  deviceStates: {},
  lastHeartbeat: null,
  heartbeatReceivedAt: null,
  lastCriticalEvent: null,
  criticalEventReceivedAt: null
};

if (!Number.isInteger(config.bridgePort) || config.bridgePort < 1 || config.bridgePort > 65535) {
  throw new Error('BRIDGE_PORT must be a valid TCP port.');
}
if (!Number.isInteger(config.sessionTtlMs) || config.sessionTtlMs < 1000) {
  throw new Error('LOCAL_AUTH_SESSION_TTL_MS must be an integer of at least 1000 milliseconds.');
}
if (Boolean(config.tlsCertPath) !== Boolean(config.tlsKeyPath)) {
  throw new Error('BRIDGE_TLS_CERT_PATH and BRIDGE_TLS_KEY_PATH must be set together.');
}
if (config.allowedOrigins.size === 0) {
  throw new Error('At least one explicit BRIDGE_ALLOWED_ORIGINS entry is required for a LAN bridge listener.');
}
if (!isLoopbackBridge && [...config.allowedOrigins].some((origin) => !origin.startsWith('https://'))) {
  throw new Error('LAN bridge origins must use HTTPS.');
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tempPath, filePath);
}

function usernameIsValid(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username || '');
}

function passwordIsValid(password) {
  return typeof password === 'string' && password.length >= 8;
}

function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return pbkdf2Sync(password, salt, 120000, 64, 'sha256').toString('hex');
}

function comparePasswordHash(candidatePassword, saltHex, expectedHash) {
  if (typeof candidatePassword !== 'string' || !saltHex || !expectedHash) return false;
  const candidateHash = hashPassword(candidatePassword, saltHex);
  return timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function makeSalt() {
  return randomBytes(16).toString('hex');
}

function makeUserId(role) {
  return `${role}-${randomBytes(16).toString('hex')}`;
}

function normalizeUserRecord(user) {
  if (!user || typeof user !== 'object') return null;
  if (!usernameIsValid(user.username)) return null;
  if (user.role !== 'admin' && user.role !== 'visitor') return null;
  if (typeof user.passwordHash !== 'string' || user.passwordHash.length < 64) return null;
  if (typeof user.salt !== 'string' || user.salt.length < 32) return null;
  const preferences = user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
    ? user.preferences
    : {};
  return {
    id: String(user.id || user.username),
    username: user.username,
    role: user.role,
    enabled: user.enabled !== false,
    createdAt: Number(user.createdAt || Date.now()),
    passwordHash: user.passwordHash,
    salt: user.salt,
    preferences: {
      theme: preferences.theme === 'dark' ? 'dark' : 'light',
      ...(typeof preferences.language === 'string' && ['en', 'vi', 'zh', 'ko', 'ja', 'fr', 'de'].includes(preferences.language)
        ? { language: preferences.language }
        : {})
    }
  };
}

function loadUsers() {
  const stored = readJson(usersFile, []);
  if (!Array.isArray(stored)) {
    throw new Error('Local account store must contain a JSON array.');
  }
  const users = stored.map(normalizeUserRecord);
  if (users.some((user) => !user)) {
    throw new Error('Local account store contains an invalid account record.');
  }
  let hasSystemAdmin = false;
  let repairedDuplicateAdmin = false;

  for (const user of users) {
    if (user.role !== 'admin') continue;
    if (!hasSystemAdmin) {
      hasSystemAdmin = true;
      continue;
    }
    user.role = 'visitor';
    repairedDuplicateAdmin = true;
  }

  if (repairedDuplicateAdmin) {
    console.warn('Multiple administrator roles found; later accounts were restored to visitor.');
    persistUsers(users);
  }

  return users;
}

function persistUsers(users) {
  writeJson(usersFile, users);
}

function getAdminUsers() {
  return loadUsers().filter((user) => user.role === 'admin');
}

loadUsers();

function stripUserSecrets(user) {
  if (!user) return null;
  const { passwordHash, salt, ...safeUser } = user;
  return safeUser;
}

function setSessionCookie(res, sessionId) {
  const cookieFlags = [
    `${config.sessionCookieName}=${sessionId}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax'
  ];
  if (useHttpsBridge) cookieFlags.push('Secure');
  res.setHeader('Set-Cookie', cookieFlags.join('; '));
}

function clearSessionCookie(res) {
  const cookieFlags = [
    `${config.sessionCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (useHttpsBridge) cookieFlags.push('Secure');
  res.setHeader('Set-Cookie', cookieFlags.join('; '));
}

function parseCookieHeader(headerValue) {
  const entries = {};
  for (const part of (headerValue || '').split(';')) {
    const [rawKey, ...rawValueParts] = part.trim().split('=');
    if (!rawKey) continue;
    entries[rawKey] = rawValueParts.join('=');
  }
  return entries;
}

function getSessionUserFromRequest(request) {
  const cookieHeader = request.headers.cookie || '';
  const cookies = parseCookieHeader(cookieHeader);
  const sessionId = cookies[config.sessionCookieName];
  if (!sessionId) return null;
  const session = sessionStore.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionId);
    return null;
  }
  const user = loadUsers().find((entry) => entry.id === session.userId && entry.enabled);
  if (!user) {
    sessionStore.delete(sessionId);
    return null;
  }
  return stripUserSecrets(user);
}

function createSession(user) {
  const now = Date.now();
  for (const [id, entry] of sessionStore) {
    if (now > entry.expiresAt) {
      sessionStore.delete(id);
    }
  }
  const sessionId = randomBytes(32).toString('hex');
  sessionStore.set(sessionId, {
    userId: user.id,
    expiresAt: now + config.sessionTtlMs
  });
  return sessionId;
}

function invalidateSessionFromRequest(request) {
  const sessionId = parseCookieHeader(request.headers.cookie || '')[config.sessionCookieName];
  if (!sessionId) return;
  sessionStore.delete(sessionId);
  for (const socket of messageClients) {
    if (socket.sessionId === sessionId) {
      messageClients.delete(socket);
      socket.close(1008, 'Session invalidated');
    }
  }
}

function revokeSessionsForUser(userId) {
  const revokedSessionIds = new Set();
  for (const [sessionId, session] of sessionStore) {
    if (session.userId === userId) {
      sessionStore.delete(sessionId);
      revokedSessionIds.add(sessionId);
    }
  }
  for (const socket of messageClients) {
    if (socket.sessionUser?.id === userId || revokedSessionIds.has(socket.sessionId)) {
      messageClients.delete(socket);
      socket.close(1008, 'Session revoked');
    }
  }
}

function getLoginAttemptState(request) {
  const address = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now >= entry.resetAt) {
      loginAttempts.delete(key);
    }
  }
  const existing = loginAttempts.get(address);
  if (!existing || now >= existing.resetAt) {
    const state = { failures: 0, resetAt: now + LOGIN_ATTEMPT_WINDOW_MS };
    loginAttempts.set(address, state);
    return state;
  }
  return existing;
}

function recordLoginFailure(request) {
  const state = getLoginAttemptState(request);
  state.failures += 1;
  return state;
}

function requireAuth(request) {
  const user = getSessionUserFromRequest(request);
  if (!user) return null;
  return user;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function getOriginFromRequest(request) {
  const origin = request.headers.origin || request.headers.referer || '';
  if (!origin) return null;
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(request) {
  if (!request.headers.origin) {
    return request.method === 'GET' || request.method === 'HEAD';
  }
  const origin = getOriginFromRequest(request);
  return Boolean(origin) && config.allowedOrigins.has(origin);
}

function applyCorsHeaders(request, res) {
  const requestOrigin = request.headers.origin;
  const origin = getOriginFromRequest(request);
  if (!requestOrigin || !origin || !config.allowedOrigins.has(origin)) return;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function handleUsersRequest(request, res) {
  const user = requireAuth(request);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'Administrator access required.' });
    return;
  }

  if (request.method === 'GET') {
    const users = loadUsers();
    sendJson(res, 200, { users: users.map(stripUserSecrets) });
    return;
  }

  if (request.method !== 'POST') {
    sendJson(res, 405, { error: 'Unsupported method.' });
    return;
  }

  let body = '';
  let bodyTooLarge = false;
  request.on('data', (chunk) => {
    if (bodyTooLarge || body.length + chunk.length > 1024) {
      bodyTooLarge = true;
      return;
    }
    body += chunk;
  });
  request.on('end', () => {
    if (bodyTooLarge) {
      sendJson(res, 413, { error: 'User payload is too large.' });
      return;
    }
    let parsed;
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      sendJson(res, 400, { error: 'Malformed user payload.' });
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      sendJson(res, 400, { error: 'Malformed user payload.' });
      return;
    }

    const username = typeof parsed.username === 'string' ? parsed.username.trim() : '';
    const password = typeof parsed.password === 'string' ? parsed.password : '';
    if (!usernameIsValid(username) || !passwordIsValid(password)) {
      sendJson(res, 400, { error: 'Use a 3-20 character username and a password with at least 8 characters.' });
      return;
    }

    const users = loadUsers();
    if (users.some((entry) => entry.username.toLowerCase() === username.toLowerCase())) {
      sendJson(res, 409, { error: 'That username is already in use.' });
      return;
    }

    const salt = makeSalt();
    const visitor = {
      id: makeUserId('visitor'),
      username,
      role: 'visitor',
      enabled: true,
      createdAt: Date.now(),
      salt,
      passwordHash: hashPassword(password, salt),
      preferences: { theme: 'light' }
    };
    try {
      persistUsers([...users, visitor]);
      sendJson(res, 201, { user: stripUserSecrets(visitor) });
    } catch {
      console.error('Failed to persist visitor account.');
      sendJson(res, 500, { error: 'Unable to save the visitor account.' });
    }
  });
}

function handleVisitorEnabledRequest(request, res, visitorId, enabled) {
  const user = requireAuth(request);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'Administrator access required.' });
    return;
  }

  const users = loadUsers();
  const visitor = users.find((entry) => entry.id === visitorId);
  if (!visitor) {
    sendJson(res, 404, { error: 'User not found.' });
    return;
  }
  if (visitor.role !== 'visitor') {
    sendJson(res, 400, { error: 'The system administrator cannot be disabled or changed here.' });
    return;
  }

  visitor.enabled = enabled;
  try {
    persistUsers(users);
  } catch {
    console.error('Failed to update visitor account state.');
    sendJson(res, 500, { error: 'Unable to update the visitor account.' });
    return;
  }
  if (!enabled) revokeSessionsForUser(visitor.id);
  sendJson(res, 200, { user: stripUserSecrets(visitor) });
}

function handleSettingsRequest(request, res) {
  const user = requireAuth(request);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }

  if (request.method === 'GET') {
    const currentUser = loadUsers().find((entry) => entry.username === user.username);
    sendJson(res, 200, {
      user: stripUserSecrets(currentUser || user),
      preferences: currentUser?.preferences || { theme: 'light' }
    });
    return;
  }

  if (request.method === 'POST') {
    let body = '';
    let bodyTooLarge = false;
    request.on('data', (chunk) => {
      if (bodyTooLarge || body.length + chunk.length > 4096) {
        bodyTooLarge = true;
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      if (bodyTooLarge) {
        sendJson(res, 413, { error: 'Settings payload is too large.' });
        return;
      }
      let parsed;
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        sendJson(res, 400, { error: 'Malformed settings payload.' });
        return;
      }
      const allowedLanguages = ['en', 'vi', 'zh', 'ko', 'ja', 'fr', 'de'];
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || Object.keys(parsed).some((key) => key !== 'preferences')
        || !parsed.preferences || typeof parsed.preferences !== 'object' || Array.isArray(parsed.preferences)
        || Object.keys(parsed.preferences).length === 0
        || Object.keys(parsed.preferences).some((key) => key !== 'theme' && key !== 'language')
        || (parsed.preferences.theme !== undefined && !['light', 'dark'].includes(parsed.preferences.theme))
        || (parsed.preferences.language !== undefined && !allowedLanguages.includes(parsed.preferences.language))) {
        sendJson(res, 400, { error: 'Only valid theme or language preferences can be updated.' });
        return;
      }

      const users = loadUsers();
      const currentUser = users.find((entry) => entry.id === user.id);
      if (!currentUser) {
        sendJson(res, 404, { error: 'User not found.' });
        return;
      }
      const nextTheme = parsed.preferences.theme || currentUser.preferences?.theme || 'light';
      const nextLang = parsed.preferences.language || currentUser.preferences?.language;
      currentUser.preferences = {
        theme: nextTheme,
        ...(nextLang ? { language: nextLang } : {})
      };
      try {
        persistUsers(users);
      } catch {
        console.error('Failed to persist user preferences.');
        sendJson(res, 500, { error: 'Unable to save account settings.' });
        return;
      }
      sendJson(res, 200, {
        user: stripUserSecrets(currentUser),
        preferences: currentUser.preferences
      });
    });
    return;
  }

  sendJson(res, 405, { error: 'Unsupported method.' });
}

function normalizeTargetState(route, rawTarget) {
  if (!route) return null;
  if (typeof rawTarget === 'boolean') {
    if (route.isLock) return rawTarget ? 'UNLOCKED' : 'LOCKED';
    return rawTarget ? 'ON' : 'OFF';
  }
  if (typeof rawTarget !== 'string') return null;
  const upper = rawTarget.trim().toUpperCase();
  if (route.isLock) {
    if (upper === 'LOCKED' || upper === 'OFF') return 'LOCKED';
    if (upper === 'UNLOCKED' || upper === 'ON') return 'UNLOCKED';
    return null;
  }
  if (upper === 'ON' || upper === 'OFF') return upper;
  return null;
}

function handleHardwareStateRequest(request, res) {
  const user = requireAuth(request);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }
  if (request.method !== 'GET') {
    sendJson(res, 405, { error: 'Unsupported method.' });
    return;
  }
  sendJson(res, 200, {
    brokerConnected: brokerClient.connected,
    snapshot: hardwareStateCache.snapshot,
    snapshotReceivedAt: hardwareStateCache.snapshotReceivedAt,
    deviceStates: hardwareStateCache.deviceStates,
    lastHeartbeat: hardwareStateCache.lastHeartbeat,
    heartbeatReceivedAt: hardwareStateCache.heartbeatReceivedAt,
    lastCriticalEvent: hardwareStateCache.lastCriticalEvent,
    criticalEventReceivedAt: hardwareStateCache.criticalEventReceivedAt
  });
}

function handleDeviceCommandRequest(request, res) {
  const user = requireAuth(request);
  if (!user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return;
  }
  if (user.role !== 'admin') {
    sendJson(res, 403, { error: 'Administrator access required.' });
    return;
  }
  if (request.method !== 'POST') {
    sendJson(res, 405, { error: 'Unsupported method.' });
    return;
  }

  let body = '';
  let bodyTooLarge = false;
  request.on('data', (chunk) => {
    if (bodyTooLarge || body.length + chunk.length > 1024) {
      bodyTooLarge = true;
      return;
    }
    body += chunk;
  });
  request.on('end', () => {
    if (bodyTooLarge) {
      sendJson(res, 413, { error: 'Command payload is too large.' });
      return;
    }
    let parsed;
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      sendJson(res, 400, { error: 'Malformed command payload.' });
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      sendJson(res, 400, { error: 'Malformed command payload.' });
      return;
    }

    const deviceId = typeof parsed.deviceId === 'string' ? parsed.deviceId.trim() : '';
    const route = Object.prototype.hasOwnProperty.call(DEVICE_COMMAND_ROUTES, deviceId)
      ? DEVICE_COMMAND_ROUTES[deviceId]
      : null;
    if (!route) {
      sendJson(res, 400, { error: 'Unknown target deviceId.' });
      return;
    }

    const normalizedState = normalizeTargetState(route, parsed.targetState);
    if (!normalizedState) {
      sendJson(res, 400, { error: 'Invalid targetState for device.' });
      return;
    }

    if (!brokerClient.connected) {
      sendJson(res, 503, { error: 'MQTT broker is unavailable.' });
      return;
    }

    const commandId = `cmd-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const timestampMs = Date.now();
    const commandPayload = {
      commandId,
      deviceId,
      zoneId: route.zone,
      deviceType: route.type,
      targetState: normalizedState,
      source: 'web_bridge',
      requestedBy: user.username,
      timestampMs
    };

    brokerClient.publish(route.topic, JSON.stringify(commandPayload), { qos: 1, retain: false }, (error) => {
      if (error) {
        sendJson(res, 503, { error: 'Failed to publish MQTT command to broker.' });
        return;
      }
      sendJson(res, 200, {
        status: 'ACCEPTED',
        mqttPublished: true,
        commandId,
        deviceId,
        zoneId: route.zone,
        topic: route.topic,
        targetState: normalizedState,
        timestampMs
      });
    });
  });
}

function responseToJson(response) {
  return response.text().then((text) => {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  });
}

const bridgeServer = useHttpsBridge
  ? createHttpsServer({
    cert: readFileSync(config.tlsCertPath || path.join(config.appDataDir, 'server.crt')),
    key: readFileSync(config.tlsKeyPath || path.join(config.appDataDir, 'server.key'))
  })
  : createHttpServer();

bridgeServer.on('request', (request, res) => {
  const url = new URL(request.url || '/', 'http://localhost');
  applyCorsHeaders(request, res);
  if (!isAllowedOrigin(request)) {
    sendJson(res, 403, { error: 'Origin not allowed.' });
    return;
  }

  if (request.method === 'OPTIONS') {
    if (!request.headers.origin) {
      sendJson(res, 403, { error: 'Origin required for preflight request.' });
      return;
    }
    const requestedMethod = request.headers['access-control-request-method'];
    const requestedHeaders = (request.headers['access-control-request-headers'] || '')
      .split(',')
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);
    if ((requestedMethod && !['GET', 'POST'].includes(requestedMethod.toUpperCase()))
      || requestedHeaders.some((header) => header !== 'content-type')) {
      sendJson(res, 403, { error: 'Preflight request not allowed.' });
      return;
    }
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  if (url.pathname === '/api/auth/session') {
    const currentUser = requireAuth(request);
    const users = loadUsers();
    if (!currentUser) {
      sendJson(res, 200, { authenticated: false, needsBootstrap: users.length === 0, user: null });
      return;
    }
    sendJson(res, 200, { authenticated: true, needsBootstrap: false, user: stripUserSecrets(currentUser) });
    return;
  }

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const attemptState = getLoginAttemptState(request);
    if (attemptState.failures >= MAX_LOGIN_ATTEMPTS) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((attemptState.resetAt - Date.now()) / 1000))));
      sendJson(res, 429, { error: 'Too many sign-in attempts. Try again later.' });
      return;
    }
    const users = loadUsers();
    if (users.length === 0) {
      sendJson(res, 401, { error: 'A local administrator account has not been bootstrapped yet.' });
      return;
    }
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024) {
        body = body.slice(0, 1024);
      }
    });
    request.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const username = String(parsed.username || '').trim();
        const password = String(parsed.password || '');
        const user = users.find((entry) => entry.enabled && entry.username.toLowerCase() === username.toLowerCase());
        if (!user || !comparePasswordHash(password, user.salt, user.passwordHash)) {
          recordLoginFailure(request);
          sendJson(res, 401, { error: 'Invalid username or password.' });
          return;
        }
        loginAttempts.delete(request.socket.remoteAddress || 'unknown');
        invalidateSessionFromRequest(request);
        const sessionId = createSession(user);
        setSessionCookie(res, sessionId);
        sendJson(res, 200, { authenticated: true, user: stripUserSecrets(user) });
      } catch {
        sendJson(res, 400, { error: 'Malformed login payload.' });
      }
    });
    return;
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    invalidateSessionFromRequest(request);
    clearSessionCookie(res);
    sendJson(res, 200, { authenticated: false, user: null });
    return;
  }

  if (url.pathname === '/api/settings/me') {
    handleSettingsRequest(request, res);
    return;
  }

  if (url.pathname === '/api/admin/users') {
    handleUsersRequest(request, res);
    return;
  }

  const visitorStateMatch = url.pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]+)\/(disable|enable)$/);
  if (visitorStateMatch && request.method === 'POST') {
    handleVisitorEnabledRequest(request, res, visitorStateMatch[1], visitorStateMatch[2] === 'enable');
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, {
      status: 'ok',
      bridge: 'local-session-auth'
    });
    return;
  }

  if (url.pathname === '/api/admin/test-events/status' && request.method === 'GET') {
    const user = requireAuth(request);
    if (!user) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    if (user.role !== 'admin') {
      sendJson(res, 403, { error: 'Administrator access required.' });
      return;
    }

    if (!testEventOutbox) {
      sendJson(res, 200, {
        enabled: false,
        firestoreConfigured: false,
        outbox: { pending: 0, quarantined: 0, oldestPendingAgeMs: 0 }
      });
      return;
    }

    testEventOutbox.getStatus()
      .then((outbox) => sendJson(res, 200, {
        enabled: true,
        firestoreConfigured: testFirebaseWriterReady,
        outbox
      }))
      .catch(() => {
        console.error('Could not read the test event outbox status.');
        sendJson(res, 500, { error: 'Test event status is unavailable.' });
      });
    return;
  }

  if (url.pathname === '/api/hardware/state') {
    handleHardwareStateRequest(request, res);
    return;
  }

  if (url.pathname === '/api/devices/command') {
    handleDeviceCommandRequest(request, res);
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
});

const isAllowedTopic = (topic) => config.allowedTopics.includes(topic);

const isAllowedHardwareTopic = (topic) => (
  HOME_TELEMETRY_TOPIC_REGEX.test(topic)
  || HOME_STATE_TOPIC_REGEX.test(topic)
  || topic === HOME_HEARTBEAT_TOPIC
  || topic === HOME_CRITICAL_EVENT_TOPIC
);

function isValidHardwarePayload(topic, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  if (HOME_TELEMETRY_TOPIC_REGEX.test(topic)) {
    return payload.schema_version === 1
      && payload.dht11 && typeof payload.dht11 === 'object' && !Array.isArray(payload.dht11)
      && payload.mq2 && typeof payload.mq2 === 'object' && !Array.isArray(payload.mq2)
      && payload.devices && typeof payload.devices === 'object' && !Array.isArray(payload.devices);
  }
  if (HOME_STATE_TOPIC_REGEX.test(topic)) {
    return typeof payload.deviceId === 'string'
      && typeof payload.state === 'string'
      && ['SUCCESS', 'FAILED'].includes(payload.status);
  }
  if (topic === HOME_HEARTBEAT_TOPIC) {
    return typeof payload.gatewayId === 'string';
  }
  if (topic === HOME_CRITICAL_EVENT_TOPIC) {
    return payload.schema_version === 1
      && payload.kind === 'hardware_hazard_event'
      && typeof payload.event_id === 'string';
  }
  return false;
}

function recordHardwarePayload(topic, payload) {
  const receivedAt = new Date().toISOString();
  if (HOME_TELEMETRY_TOPIC_REGEX.test(topic)) {
    hardwareStateCache.snapshot = payload;
    hardwareStateCache.snapshotReceivedAt = receivedAt;
    return;
  }
  if (HOME_STATE_TOPIC_REGEX.test(topic)) {
    hardwareStateCache.deviceStates[payload.deviceId] = { ...payload, receivedAt };
    if (payload.status === 'SUCCESS' && hardwareStateCache.snapshot?.devices
      && Object.prototype.hasOwnProperty.call(hardwareStateCache.snapshot.devices, payload.deviceId)) {
      hardwareStateCache.snapshot.devices[payload.deviceId] = payload.deviceId === 'door_nfc'
        ? payload.state
        : payload.state === 'ON';
    }
    return;
  }
  if (topic === HOME_HEARTBEAT_TOPIC) {
    hardwareStateCache.lastHeartbeat = payload;
    hardwareStateCache.heartbeatReceivedAt = receivedAt;
    return;
  }
  if (topic === HOME_CRITICAL_EVENT_TOPIC) {
    hardwareStateCache.lastCriticalEvent = payload;
    hardwareStateCache.criticalEventReceivedAt = receivedAt;
  }
}

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

  if (config.brokerUsername) options.username = config.brokerUsername;
  if (config.brokerPassword) options.password = config.brokerPassword;
  if (config.brokerCaPath) options.ca = readFileSync(config.brokerCaPath);
  return options;
};

async function initializeTestEventDelivery() {
  try {
    await testEventOutbox.initialize();
    testEventOutboxReady = true;
  } catch {
    console.error('Test event outbox could not be initialized; synthetic events will not be acknowledged.');
    return;
  }

  let writer = null;
  try {
    const { createFirebaseTestWriter } = await import('./firebase_test_admin.mjs');
    writer = await createFirebaseTestWriter({
      testProjectId: config.firebaseTestProjectId,
      productionProjectId: config.firebaseProductionProjectId,
      useEmulator: config.firestoreTestEmulator,
      emulatorHost: config.firestoreEmulatorHost,
      credentialsPath: config.firebaseCredentialsPath,
      repositoryRoot: path.resolve(__dirname, '..')
    });
    testFirebaseWriterReady = true;
  } catch {
    console.error(
      'Firebase test writer is unavailable; synthetic events will remain in the local outbox until configuration is fixed and the bridge restarts.'
    );
  }

  testEventWorker = new TestEventDeliveryWorker({
    outbox: testEventOutbox,
    writer
  });
  const retryTimer = setInterval(() => {
    testEventWorker.runOnce().catch(() => {
      console.error('Test event delivery worker failed; queued events remain in the local outbox.');
    });
  }, 1000);
  retryTimer.unref();
}

if (testEventOutbox) {
  initializeTestEventDelivery().catch(() => {
    console.error('Test event delivery initialization failed; local bridge services remain available.');
  });
}

const sendStatus = (status, detail) => {
  for (const client of messageClients) {
    if (client.readyState !== client.OPEN) {
      messageClients.delete(client);
      continue;
    }
    client.send(JSON.stringify({ type: 'status', state: status, detail, time: new Date().toISOString() }));
  }
};

const sendPayload = (topic, payload) => {
  if (topic === TEST_NOTIFICATION_TOPIC) return;
  const testTopicAllowed = isAllowedTopic(topic);
  const hardwareTopicAllowed = isAllowedHardwareTopic(topic);
  if ((!testTopicAllowed && !hardwareTopicAllowed)
    || (testTopicAllowed && !isValidTestPayload(payload))
    || (hardwareTopicAllowed && !isValidHardwarePayload(topic, payload))) {
    console.warn(`Rejected invalid or unexpected broker payload on ${topic}`);
    return;
  }
  if (hardwareTopicAllowed) {
    recordHardwarePayload(topic, payload);
  }
  const envelope = { type: 'mqtt-message', topic, payload, receivedAt: new Date().toISOString() };
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
const handleMqttMessage = brokerClient.handleMessage.bind(brokerClient);
brokerClient.handleMessage = (packet, callback) => {
  if (packet.topic !== TEST_NOTIFICATION_TOPIC) {
    handleMqttMessage(packet, callback);
    return;
  }

  if (packet.payload.length > MAX_BROKER_MESSAGE_BYTES) {
    console.warn('Rejected oversized synthetic event notification.');
    handleMqttMessage(packet, callback);
    return;
  }

  let event;
  try {
    event = validateTestNotification(
      packet.topic,
      JSON.parse(packet.payload.toString('utf8'))
    );
  } catch {
    console.warn('Rejected invalid synthetic event notification.');
    handleMqttMessage(packet, callback);
    return;
  }

  if (!testEventOutboxReady) {
    callback(new Error('Test event outbox is unavailable.'));
    return;
  }

  testEventOutbox.enqueue(event)
    .then((result) => {
      if (result.duplicate) {
        console.info(`Duplicate test event already queued: ${event.event_id}`);
      }
      testEventWorker?.runOnce().catch(() => {
        console.error('Test event delivery attempt failed; event remains queued.');
      });
      handleMqttMessage(packet, callback);
    })
    .catch((error) => {
      const code = String(error.code || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      console.error(`Could not persist synthetic event before MQTT acknowledgement (${code || 'unknown'}).`);
      callback(error);
    });
};

brokerClient.on('connect', () => {
  console.log('MQTT broker connected.');
  sendStatus('connected', 'MQTT broker reachable');
  const subscribeTopic = (topic, qos) => {
    brokerClient.subscribe(topic, { qos }, (error) => {
      if (error) {
        console.error(`Failed to subscribe to ${topic} (${error.code || error.name || 'unknown error'}).`);
        return;
      }
      console.log(`Subscribed to ${topic}`);
    });
  };
  for (const topic of config.allowedTopics) {
    subscribeTopic(topic, topic === TEST_NOTIFICATION_TOPIC ? 1 : 0);
  }
  for (const topic of HOME_HARDWARE_TOPICS) {
    const qos = topic.endsWith('/state') || topic === HOME_CRITICAL_EVENT_TOPIC ? 1 : 0;
    subscribeTopic(topic, qos);
  }
});

brokerClient.on('reconnect', () => {
  console.warn('MQTT broker reconnecting ...');
  sendStatus('reconnecting', 'MQTT broker reconnect in progress');
});

brokerClient.on('error', (error) => {
  console.error(`MQTT broker connection error (${error.code || error.name || 'unknown error'}).`);
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
  } catch {
    payload = payloadBuffer.toString('utf8');
  }
  sendPayload(topic, payload);
});

const wss = new WebSocketServer({
  server: bridgeServer,
  maxPayload: MAX_BROKER_MESSAGE_BYTES,
  verifyClient: (info, done) => {
    const origin = info.origin || info.req.headers.origin || '';
    const allowed = Boolean(origin) && config.allowedOrigins.has(origin);
    if (allowed) {
      const sessionUser = getSessionUserFromRequest(info.req);
      if (sessionUser) {
        done(true);
        return;
      }
      done(false, 401, 'Authentication required');
      return;
    }
    done(false, 403, 'Origin not allowed');
  }
});

wss.on('connection', (socket, request) => {
  socket.sessionId = parseCookieHeader(request.headers.cookie || '')[config.sessionCookieName];
  socket.sessionUser = getSessionUserFromRequest(request);
  const session = sessionStore.get(socket.sessionId);
  if (!socket.sessionUser) {
    socket.close(1008, 'Authentication required');
    return;
  }
  if (!session) {
    socket.close(1008, 'Session invalidated');
    return;
  }

  messageClients.add(socket);
  socket.sessionExpiryTimer = setTimeout(() => {
    messageClients.delete(socket);
    socket.close(1008, 'Session expired');
  }, Math.max(0, session.expiresAt - Date.now()));
  socket.sessionExpiryTimer.unref();
  socket.send(JSON.stringify({
    type: 'status',
    state: brokerClient.connected ? 'connected' : 'unavailable',
    detail: brokerClient.connected ? 'MQTT broker reachable' : 'MQTT broker unavailable',
    time: new Date().toISOString()
  }));

  socket.on('message', (raw) => {
    if (raw.length > MAX_BROWSER_MESSAGE_BYTES) {
      socket.send(JSON.stringify({ type: 'error', message: 'Browser message is too large', time: new Date().toISOString() }));
      socket.close(1009, 'Message too large');
      return;
    }
    try {
      const message = JSON.parse(raw.toString('utf8'));
      if (message.type === 'authenticate') {
        socket.send(JSON.stringify({ type: 'authenticated', time: new Date().toISOString() }));
        return;
      }
      if (message.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', time: new Date().toISOString() }));
        return;
      }
      if (message.type === 'subscribe') {
        socket.send(JSON.stringify({ type: 'subscribed', topics: config.allowedTopics, time: new Date().toISOString() }));
        return;
      }
      socket.send(JSON.stringify({ type: 'error', message: 'Unsupported browser message', time: new Date().toISOString() }));
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Malformed browser payload', time: new Date().toISOString() }));
      socket.close(1007, 'Malformed browser payload');
    }
  });

  socket.on('close', () => {
    clearTimeout(socket.sessionExpiryTimer);
    messageClients.delete(socket);
  });

  socket.on('error', (error) => {
    clearTimeout(socket.sessionExpiryTimer);
    console.error('WebSocket error:', error);
    messageClients.delete(socket);
  });
});

if (useHttpsBridge) {
  bridgeServer.listen(config.bridgePort, config.bridgeHost, () => {
    console.log(`Authenticated LAN bridge listening on wss://${config.bridgeHost}:${config.bridgePort}`);
  });
} else {
  bridgeServer.listen(config.bridgePort, config.bridgeHost, () => {
    console.log(`Local bridge listening on ws://${config.bridgeHost}:${config.bridgePort}`);
  });
}
console.log('Starting server-side MQTT bridge.');
