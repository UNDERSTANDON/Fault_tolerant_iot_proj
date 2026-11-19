import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import https from 'node:https';
import WebSocket from 'ws';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createLocalAdminAccount } from './setup_local_admin.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const allowedHttpOrigin = 'http://localhost:5173';
const brokerUsernameSecret = 'PRIVATE_BROKER_USERNAME_TEST_MARKER';
const brokerPasswordSecret = 'PRIVATE_BROKER_PASSWORD_TEST_MARKER';
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

function startBridge({
  appDataDir,
  port,
  origin = allowedHttpOrigin,
  username = '',
  password = '',
  sessionTtlMs = 21600000,
  tlsCertPath = '',
  tlsKeyPath = ''
}) {
  if (username && password) {
    createLocalAdminAccount({
      usersFile: path.join(appDataDir, 'FaultTolerantIoT', 'local-server', 'users.json'),
      username,
      password
    });
  }
  const env = {
    ...process.env,
    LOCALAPPDATA: appDataDir,
    LOCAL_BROKER_CREDENTIALS: '',
    BRIDGE_HOST: '127.0.0.1',
    BRIDGE_PORT: String(port),
    BRIDGE_ALLOWED_ORIGINS: origin,
    BRIDGE_TLS_CERT_PATH: tlsCertPath,
    BRIDGE_TLS_KEY_PATH: tlsKeyPath,
    BROKER_URL: 'wss://127.0.0.1:1',
    BROKER_USERNAME: brokerUsernameSecret,
    BROKER_PASSWORD: brokerPasswordSecret,
    BROKER_CA_PATH: '',
    LOCAL_AUTH_SESSION_TTL_MS: String(sessionTtlMs)
  };
  const child = spawn(process.execPath, ['lan_broker_bridge.mjs'], {
    cwd: __dirname,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, output: () => output };
}

async function stopBridge(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exited, delay(1000)]);
  }
}

async function waitForHealth(port, { secure = false, ca, timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (secure) {
        const response = await requestHttps(port, '/api/health', { ca, origin: 'https://localhost:5173' });
        if (response.statusCode === 200) return true;
      } else {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          headers: { Origin: allowedHttpOrigin }
        });
        if (response.ok) return true;
      }
    } catch {
      // The bridge is still starting.
    }
    await delay(100);
  }
  return false;
}

async function requestJson(port, pathname, {
  body,
  method = body === undefined ? 'GET' : 'POST',
  origin = allowedHttpOrigin,
  cookie,
  headers = {}
} = {}) {
  const requestHeaders = { ...headers };
  if (origin) requestHeaders.Origin = origin;
  if (cookie) requestHeaders.Cookie = cookie;
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: requestHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  return {
    response,
    json: text ? JSON.parse(text) : {},
    text
  };
}

function cookieValue(setCookie) {
  assert.ok(setCookie?.includes('fault_iot_session='), 'session cookie should be set');
  return setCookie.split(';')[0];
}

function requestHttps(port, pathname, { method = 'GET', origin, cookie, body, ca } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const request = https.request({
      hostname: 'localhost',
      port,
      path: pathname,
      method,
      headers,
      ca
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        text,
        json: text ? JSON.parse(text) : {}
      }));
    });
    request.on('error', reject);
    if (body !== undefined) request.write(JSON.stringify(body));
    request.end();
  });
}

function connectWebSocket(port, { origin, cookie, secure = false, ca } = {}) {
  return new Promise((resolve) => {
    const headers = cookie ? { Cookie: cookie } : {};
    const socket = new WebSocket(`${secure ? 'wss://localhost' : 'ws://127.0.0.1'}:${port}`, {
      ...(origin ? { origin } : {}),
      headers,
      ...(ca ? { ca } : {})
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ socket, ...result });
    };
    socket.once('open', () => finish({ statusCode: 101 }));
    socket.once('unexpected-response', (request, response) => {
      response.resume();
      finish({ statusCode: response.statusCode });
    });
    socket.once('error', () => finish({ statusCode: 0 }));
    setTimeout(() => finish({ statusCode: 0 }), 5000).unref();
  });
}

function waitForSocketMessage(socket, expectedType, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for WebSocket message: ${expectedType}`));
    }, timeoutMs);
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }
      if (message.type !== expectedType) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

test('auth, roles, secrets, CSRF, sessions, revocation, and read-only bridge behavior', async () => {
  const port = await getAvailablePort();
  const appDataDir = mkdtempSync(path.join(os.tmpdir(), 'fault-iot-auth-'));
  const server = startBridge({ appDataDir, port });
  let adminCookie;
  let visitorCookie;
  let visitorSocket;

  try {
    assert.equal(await waitForHealth(port), true, 'bridge server did not start');

    const sessionBeforeBootstrap = await requestJson(port, '/api/auth/session');
    assert.equal(sessionBeforeBootstrap.json.authenticated, false);
    assert.equal(sessionBeforeBootstrap.json.needsBootstrap, true);

    const deniedBootstrap = await requestJson(port, '/api/auth/bootstrap-admin', {
      method: 'POST',
      origin: 'http://untrusted.example',
      body: { username: 'sessionadmin', password: 'StrongPass123' }
    });
    assert.equal(deniedBootstrap.response.status, 403);

    const preflight = await fetch(`http://127.0.0.1:${port}/api/auth/bootstrap-admin`, {
      method: 'OPTIONS',
      headers: {
        Origin: allowedHttpOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), allowedHttpOrigin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

    const deniedPreflight = await fetch(`http://127.0.0.1:${port}/api/auth/bootstrap-admin`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://untrusted.example', 'Access-Control-Request-Method': 'POST' }
    });
    assert.equal(deniedPreflight.status, 403);
    assert.equal(deniedPreflight.headers.get('access-control-allow-origin'), null);

    const disabledHttpBootstrap = await requestJson(port, '/api/auth/bootstrap-admin', {
      method: 'POST',
      body: { username: 'sessionadmin', password: 'StrongPass123' }
    });
    assert.equal(disabledHttpBootstrap.response.status, 404);

    const usersFile = path.join(appDataDir, 'FaultTolerantIoT', 'local-server', 'users.json');
    const bootstrapUser = createLocalAdminAccount({
      usersFile,
      username: 'sessionadmin',
      password: 'StrongPass123'
    });
    assert.equal(bootstrapUser.role, 'admin');
    assert.throws(() => createLocalAdminAccount({
      usersFile,
      username: 'secondadmin',
      password: 'AnotherPass123'
    }), /already exists/);

    const adminLogin = await requestJson(port, '/api/auth/login', {
      body: { username: 'sessionadmin', password: 'StrongPass123' }
    });
    assert.equal(adminLogin.response.status, 200);
    adminCookie = cookieValue(adminLogin.response.headers.get('set-cookie'));
    const sessionCookie = adminLogin.response.headers.get('set-cookie');
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /SameSite=Lax/i);
    assert.doesNotMatch(sessionCookie, /Max-Age=/i);
    assert.doesNotMatch(sessionCookie, /Secure/i);

    const persistedUsersText = readFileSync(usersFile, 'utf8');
    const persistedAdmin = JSON.parse(persistedUsersText)[0];
    assert.equal('password' in persistedAdmin, false);
    assert.match(persistedAdmin.salt, /^[a-f0-9]{32}$/);
    assert.match(persistedAdmin.passwordHash, /^[a-f0-9]{128}$/);
    assert.notEqual(persistedAdmin.passwordHash, 'StrongPass123');
    assert.equal(persistedUsersText.includes('StrongPass123'), false);

    const noOriginMutation = await requestJson(port, '/api/admin/users', {
      method: 'POST',
      origin: null,
      cookie: adminCookie,
      body: { username: 'nobody', password: 'NobodyPass123' }
    });
    assert.equal(noOriginMutation.response.status, 403);

    const wrongOriginMutation = await requestJson(port, '/api/admin/users', {
      method: 'POST',
      origin: 'http://untrusted.example',
      cookie: adminCookie,
      body: { username: 'nobody', password: 'NobodyPass123' }
    });
    assert.equal(wrongOriginMutation.response.status, 403);

    const wrongOriginSettings = await requestJson(port, '/api/settings/me', {
      method: 'POST',
      origin: 'http://untrusted.example',
      cookie: adminCookie,
      body: { preferences: { theme: 'dark' } }
    });
    assert.equal(wrongOriginSettings.response.status, 403);

    const oldAdminSocket = await connectWebSocket(port, {
      origin: allowedHttpOrigin,
      cookie: adminCookie
    });
    assert.equal(oldAdminSocket.statusCode, 101);
    await waitForSocketMessage(oldAdminSocket.socket, 'status');
    const oldAdminSocketClosed = new Promise((resolve) => {
      oldAdminSocket.socket.once('close', (code) => resolve(code));
    });
    const rotatedLogin = await requestJson(port, '/api/auth/login', {
      method: 'POST',
      cookie: adminCookie,
      body: { username: 'sessionadmin', password: 'StrongPass123' }
    });
    assert.equal(rotatedLogin.response.status, 200);
    assert.equal(await oldAdminSocketClosed, 1008);
    const previousAdminCookie = adminCookie;
    adminCookie = cookieValue(rotatedLogin.response.headers.get('set-cookie'));
    assert.notEqual(adminCookie, previousAdminCookie);

    const oldAdminSession = await requestJson(port, '/api/auth/session', { cookie: previousAdminCookie });
    assert.equal(oldAdminSession.json.authenticated, false);
    const refreshedAdminSession = await requestJson(port, '/api/auth/session', { cookie: adminCookie });
    assert.equal(refreshedAdminSession.json.authenticated, true);
    assert.equal(refreshedAdminSession.json.user.role, 'admin');
    const repeatedSessionCheck = await requestJson(port, '/api/auth/session', { cookie: adminCookie });
    assert.equal(repeatedSessionCheck.json.user.id, refreshedAdminSession.json.user.id);
    assert.equal(repeatedSessionCheck.response.headers.get('set-cookie'), null);

    const unauthenticatedCreate = await requestJson(port, '/api/admin/users', {
      method: 'POST',
      body: { username: 'visitor01', password: 'VisitorPass123' }
    });
    assert.equal(unauthenticatedCreate.response.status, 401);

    const visitorCreate = await requestJson(port, '/api/admin/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { username: 'visitor01', password: 'VisitorPass123', role: 'admin' }
    });
    assert.equal(visitorCreate.response.status, 201);
    assert.equal(visitorCreate.json.user.role, 'visitor');
    assert.equal('passwordHash' in visitorCreate.json.user, false);
    assert.equal('salt' in visitorCreate.json.user, false);
    const visitorId = visitorCreate.json.user.id;

    const duplicateVisitor = await requestJson(port, '/api/admin/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { username: 'VISITOR01', password: 'VisitorPass456' }
    });
    assert.equal(duplicateVisitor.response.status, 409);

    const listedUsers = await requestJson(port, '/api/admin/users', { cookie: adminCookie });
    assert.equal(listedUsers.response.status, 200);
    assert.equal(listedUsers.json.users.filter((user) => user.role === 'admin').length, 1);
    assert.equal(JSON.stringify(listedUsers.json).includes('passwordHash'), false);
    assert.equal(JSON.stringify(listedUsers.json).includes('salt'), false);

    const visitorLogin = await requestJson(port, '/api/auth/login', {
      body: { username: 'visitor01', password: 'VisitorPass123' }
    });
    assert.equal(visitorLogin.response.status, 200);
    assert.equal(visitorLogin.json.user.role, 'visitor');
    visitorCookie = cookieValue(visitorLogin.response.headers.get('set-cookie'));
    assert.equal((await requestJson(port, '/api/auth/session', { cookie: adminCookie })).json.user.role, 'admin');

    const visitorUsersRequest = await requestJson(port, '/api/admin/users', { cookie: visitorCookie });
    assert.equal(visitorUsersRequest.response.status, 403);
    const visitorCreateRequest = await requestJson(port, '/api/admin/users', {
      method: 'POST',
      cookie: visitorCookie,
      body: { username: 'visitor02', password: 'VisitorPass123' }
    });
    assert.equal(visitorCreateRequest.response.status, 403);
    const visitorDisableRequest = await requestJson(port, `/api/admin/users/${visitorId}/disable`, {
      method: 'POST',
      cookie: visitorCookie
    });
    assert.equal(visitorDisableRequest.response.status, 403);

    const adminSettings = await requestJson(port, '/api/settings/me', { cookie: adminCookie });
    assert.equal(adminSettings.response.status, 200);
    assert.equal(adminSettings.json.user.role, 'admin');
    const visitorSettings = await requestJson(port, '/api/settings/me', { cookie: visitorCookie });
    assert.equal(visitorSettings.response.status, 200);
    assert.equal(visitorSettings.json.user.role, 'visitor');
    for (const payload of [adminSettings.text, visitorSettings.text]) {
      assert.equal(payload.includes(brokerUsernameSecret), false);
      assert.equal(payload.includes(brokerPasswordSecret), false);
      assert.equal(payload.includes('StrongPass123'), false);
      assert.equal(payload.includes('passwordHash'), false);
      assert.equal(payload.includes('salt'), false);
      assert.equal(payload.includes(adminCookie.split('=')[1]), false);
    }
    const invalidPreferences = await requestJson(port, '/api/settings/me', {
      method: 'POST',
      cookie: adminCookie,
      body: { preferences: { theme: 'dark', extra: 'unexpected' } }
    });
    assert.equal(invalidPreferences.response.status, 400);
    const invalidTheme = await requestJson(port, '/api/settings/me', {
      method: 'POST',
      cookie: adminCookie,
      body: { preferences: { theme: 'remote-resource' } }
    });
    assert.equal(invalidTheme.response.status, 400);
    const savedPreferences = await requestJson(port, '/api/settings/me', {
      method: 'POST',
      cookie: adminCookie,
      body: { preferences: { theme: 'dark' } }
    });
    assert.equal(savedPreferences.response.status, 200);
    assert.deepEqual(savedPreferences.json.preferences, { theme: 'dark' });
    const health = await requestJson(port, '/api/health');
    assert.equal(health.json.appDataDir, undefined);
    assert.equal(health.json.accountCount, undefined);

    const noOriginSocket = await connectWebSocket(port);
    assert.equal(noOriginSocket.statusCode, 403);
    const unauthenticatedSocket = await connectWebSocket(port, { origin: allowedHttpOrigin });
    assert.equal(unauthenticatedSocket.statusCode, 401);
    const crossOriginSocket = await connectWebSocket(port, {
      origin: 'http://untrusted.example',
      cookie: visitorCookie
    });
    assert.equal(crossOriginSocket.statusCode, 403);

    const authorizedSocket = await connectWebSocket(port, {
      origin: allowedHttpOrigin,
      cookie: visitorCookie
    });
    assert.equal(authorizedSocket.statusCode, 101);
    visitorSocket = authorizedSocket.socket;
    await waitForSocketMessage(visitorSocket, 'status');
    visitorSocket.send(JSON.stringify({ type: 'subscribe', topics: ['demo/esp32-mqtt-connectivity/test'] }));
    const subscription = await waitForSocketMessage(visitorSocket, 'subscribed');
    assert.deepEqual(subscription.topics, ['demo/esp32-mqtt-connectivity/test']);
    visitorSocket.send(JSON.stringify({ type: 'publish', topic: 'demo/esp32-mqtt-connectivity/test', payload: {} }));
    assert.equal((await waitForSocketMessage(visitorSocket, 'error')).message, 'Unsupported browser message');
    visitorSocket.send(JSON.stringify({ type: 'command', device: 'light', state: 'on' }));
    assert.equal((await waitForSocketMessage(visitorSocket, 'error')).message, 'Unsupported browser message');

    const socketRevoked = new Promise((resolve) => {
      visitorSocket.once('close', (code) => resolve(code));
    });
    const disableVisitor = await requestJson(port, `/api/admin/users/${visitorId}/disable`, {
      method: 'POST',
      cookie: adminCookie
    });
    assert.equal(disableVisitor.response.status, 200);
    assert.equal(disableVisitor.json.user.enabled, false);
    assert.equal(await socketRevoked, 1008);
    visitorSocket = null;
    const revokedVisitorSession = await requestJson(port, '/api/auth/session', { cookie: visitorCookie });
    assert.equal(revokedVisitorSession.json.authenticated, false);
    const disabledVisitorLogin = await requestJson(port, '/api/auth/login', {
      body: { username: 'visitor01', password: 'VisitorPass123' }
    });
    assert.equal(disabledVisitorLogin.response.status, 401);

    const visitorCannotEnableSelf = await requestJson(port, `/api/admin/users/${visitorId}/enable`, {
      method: 'POST',
      cookie: visitorCookie
    });
    assert.equal(visitorCannotEnableSelf.response.status, 401);
    const enableVisitor = await requestJson(port, `/api/admin/users/${visitorId}/enable`, {
      method: 'POST',
      cookie: adminCookie
    });
    assert.equal(enableVisitor.response.status, 200);
    assert.equal(enableVisitor.json.user.enabled, true);
    assert.equal((await requestJson(port, '/api/auth/session', { cookie: visitorCookie })).json.authenticated, false);

    const visitorRelogin = await requestJson(port, '/api/auth/login', {
      body: { username: 'visitor01', password: 'VisitorPass123' }
    });
    assert.equal(visitorRelogin.response.status, 200);
    visitorCookie = cookieValue(visitorRelogin.response.headers.get('set-cookie'));

    const editedUsers = JSON.parse(readFileSync(usersFile, 'utf8'));
    editedUsers.find((user) => user.id === visitorId).role = 'admin';
    writeFileSync(usersFile, JSON.stringify(editedUsers, null, 2));
    const demotedVisitorSession = await requestJson(port, '/api/auth/session', { cookie: visitorCookie });
    assert.equal(demotedVisitorSession.json.authenticated, true);
    assert.equal(demotedVisitorSession.json.user.role, 'visitor');
    const repairedUsers = JSON.parse(readFileSync(usersFile, 'utf8'));
    assert.equal(repairedUsers.filter((user) => user.role === 'admin').length, 1);
    assert.equal(repairedUsers.find((user) => user.id === visitorId).role, 'visitor');

    const disableAdministrator = await requestJson(port, `/api/admin/users/${refreshedAdminSession.json.user.id}/disable`, {
      method: 'POST',
      cookie: adminCookie
    });
    assert.equal(disableAdministrator.response.status, 400);

    const logout = await requestJson(port, '/api/auth/logout', {
      method: 'POST',
      cookie: adminCookie
    });
    assert.equal(logout.response.status, 200);
    assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/i);
    assert.equal((await requestJson(port, '/api/auth/session', { cookie: adminCookie })).json.authenticated, false);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedLogin = await requestJson(port, '/api/auth/login', {
        body: { username: 'sessionadmin', password: 'IncorrectPass123' }
      });
      assert.equal(failedLogin.response.status, 401);
    }
    const rateLimitedLogin = await requestJson(port, '/api/auth/login', {
      body: { username: 'sessionadmin', password: 'StrongPass123' }
    });
    assert.equal(rateLimitedLogin.response.status, 429);
    assert.ok(Number(rateLimitedLogin.response.headers.get('retry-after')) > 0);

    assert.equal(server.output().includes('StrongPass123'), false);
    assert.equal(server.output().includes(brokerUsernameSecret), false);
    assert.equal(server.output().includes(brokerPasswordSecret), false);
  } finally {
    visitorSocket?.close();
    await stopBridge(server.child);
  }
});

test('server-side session expires at its configured lifetime without persisting the cookie', async () => {
  const port = await getAvailablePort();
  const appDataDir = mkdtempSync(path.join(os.tmpdir(), 'fault-iot-expiry-'));
  const server = startBridge({
    appDataDir,
    port,
    username: 'expiryadmin',
    password: 'StrongPass123',
    sessionTtlMs: 1000
  });

  try {
    assert.equal(await waitForHealth(port), true, 'bridge server did not start');
    const login = await requestJson(port, '/api/auth/login', {
      body: { username: 'expiryadmin', password: 'StrongPass123' }
    });
    assert.equal(login.response.status, 200);
    const cookie = cookieValue(login.response.headers.get('set-cookie'));
    assert.doesNotMatch(login.response.headers.get('set-cookie'), /Max-Age=/i);
    assert.equal((await requestJson(port, '/api/auth/session', { cookie })).json.authenticated, true);
    const socketResult = await connectWebSocket(port, { origin: allowedHttpOrigin, cookie });
    assert.equal(socketResult.statusCode, 101);
    await waitForSocketMessage(socketResult.socket, 'status');
    const socketExpired = new Promise((resolve) => {
      socketResult.socket.once('close', (code) => resolve(code));
    });

    assert.equal(await socketExpired, 1008);
    assert.equal((await requestJson(port, '/api/auth/session', { cookie })).json.authenticated, false);
  } finally {
    await stopBridge(server.child);
  }
});

test('malformed account storage stops startup instead of appearing empty', async () => {
  for (const contents of ['{broken json', '[{"username":"invalid-record"}]']) {
    const appDataDir = mkdtempSync(path.join(os.tmpdir(), 'fault-iot-corrupt-'));
    const usersFile = path.join(appDataDir, 'FaultTolerantIoT', 'local-server', 'users.json');
    mkdirSync(path.dirname(usersFile), { recursive: true });
    writeFileSync(usersFile, contents, 'utf8');

    const env = {
      ...process.env,
      LOCALAPPDATA: appDataDir,
      LOCAL_BROKER_CREDENTIALS: '',
      BRIDGE_HOST: '127.0.0.1',
      BRIDGE_PORT: String(await getAvailablePort()),
      BRIDGE_ALLOWED_ORIGINS: allowedHttpOrigin,
      BRIDGE_TLS_CERT_PATH: '',
      BRIDGE_TLS_KEY_PATH: '',
      BROKER_URL: 'wss://127.0.0.1:1',
      BROKER_USERNAME: '',
      BROKER_PASSWORD: '',
      BROKER_CA_PATH: ''
    };
    const result = spawnSync(process.execPath, ['lan_broker_bridge.mjs'], {
      cwd: __dirname,
      env,
      encoding: 'utf8',
      timeout: 5000
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /JSON|Unexpected end|invalid account/i);
  }
});

test('HTTPS auth cookies are Secure and HttpOnly', { skip: !opensslAvailable }, async () => {
  const port = await getAvailablePort();
  const appDataDir = mkdtempSync(path.join(os.tmpdir(), 'fault-iot-https-'));
  const certPath = path.join(appDataDir, 'server.crt');
  const keyPath = path.join(appDataDir, 'server.key');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath,
    '-out', certPath,
    '-days', '1',
    '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost'
  ], { stdio: 'ignore' });
  const certificate = readFileSync(certPath);
  const origin = 'https://localhost:5173';
  const server = startBridge({
    appDataDir: path.join(appDataDir, 'data'),
    port,
    origin,
    username: 'tlsadmin',
    password: 'StrongPass123',
    tlsCertPath: certPath,
    tlsKeyPath: keyPath
  });

  try {
    assert.equal(await waitForHealth(port, { secure: true, ca: certificate }), true, 'HTTPS bridge did not start');
    const login = await requestHttps(port, '/api/auth/login', {
      method: 'POST',
      origin,
      body: { username: 'tlsadmin', password: 'StrongPass123' },
      ca: certificate
    });
    assert.equal(login.statusCode, 200);
    const cookie = cookieValue(login.headers['set-cookie']?.[0] || login.headers['set-cookie']);
    const setCookie = login.headers['set-cookie']?.[0] || login.headers['set-cookie'];
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.doesNotMatch(setCookie, /Max-Age=/i);

    const session = await requestHttps(port, '/api/auth/session', {
      origin,
      cookie,
      ca: certificate
    });
    assert.equal(session.statusCode, 200);
    assert.equal(session.json.authenticated, true);

    const secureSocketResult = await connectWebSocket(port, {
      origin,
      cookie,
      secure: true,
      ca: certificate
    });
    assert.equal(secureSocketResult.statusCode, 101);
    await waitForSocketMessage(secureSocketResult.socket, 'status');
    secureSocketResult.socket.close();

    const logout = await requestHttps(port, '/api/auth/logout', {
      method: 'POST',
      origin,
      cookie,
      ca: certificate
    });
    assert.equal(logout.statusCode, 200);
    assert.match(logout.headers['set-cookie']?.[0] || logout.headers['set-cookie'], /Secure/i);
    const revokedSession = await requestHttps(port, '/api/auth/session', {
      origin,
      cookie,
      ca: certificate
    });
    assert.equal(revokedSession.json.authenticated, false);
  } finally {
    await stopBridge(server.child);
  }
});
