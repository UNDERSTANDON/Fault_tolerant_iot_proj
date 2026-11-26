import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirebaseTestWriter } from './firebase_test_admin.mjs';
import { TestEventDeliveryWorker, TestEventOutbox } from './test_event_delivery.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(scriptDirectory, '.env') });

if (process.env.FIRESTORE_TEST_ENABLED !== 'true'
  || process.env.FIRESTORE_TEST_EMULATOR !== 'true') {
  throw new Error('Enable Firestore test and emulator mode in local_server/.env first.');
}

const testProjectId = process.env.FIREBASE_TEST_PROJECT_ID || '';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const writer = await createFirebaseTestWriter({
  testProjectId,
  productionProjectId: process.env.FIREBASE_PRODUCTION_PROJECT_ID || '',
  useEmulator: true,
  emulatorHost,
  credentialsPath: '',
  repositoryRoot: path.resolve(scriptDirectory, '..')
});
const app = getApps().find((candidate) => candidate.name === 'local-server-firebase-test-events');
if (!app) {
  throw new Error('Firebase test emulator app was not initialized.');
}

const testRunId = randomBytes(8).toString('hex');
const event = {
  schema_version: 1,
  kind: 'synthetic_notification',
  is_test: true,
  event_id: `aabbccddeeff-${testRunId}-1`,
  source: 'esp32_mock',
  device_id: 'aabbccddeeff',
  test_run_id: testRunId,
  sequence: 1,
  severity: 'warning',
  title: 'Synthetic Firestore emulator smoke test',
  message: 'Generated test notification; no physical sensor is represented.',
  timestamp_ms: 0,
  timestamp_kind: 'device_uptime_ms'
};

const firestore = getFirestore(app);
const document = firestore.collection('testEventNotifications').doc(event.event_id);
const outboxDirectory = await mkdtemp(path.join(os.tmpdir(), 'iot-firestore-emulator-smoke-'));
const outbox = new TestEventOutbox(outboxDirectory);
const writes = [];
const worker = new TestEventDeliveryWorker({
  outbox,
  writer: async (queuedEvent) => {
    const result = await writer(queuedEvent);
    writes.push(result);
    return result;
  },
  logger: { info() {}, error: console.error }
});
let documentCreated = false;
try {
  await outbox.initialize();
  await outbox.enqueue(event);
  await worker.runOnce();
  documentCreated = writes.some((result) => !result.duplicate);
  assert.equal((await outbox.getStatus()).pending, 0);

  await outbox.enqueue(event);
  await worker.runOnce();
  const snapshot = await document.get();
  assert.equal(snapshot.exists, true);
  assert.deepEqual(snapshot.data(), event);
  assert.equal((await outbox.getStatus()).pending, 0);
  assert.deepEqual(writes, [{ duplicate: false }, { duplicate: true }]);
  console.log('PASS outbox delivery, Firestore readback, and duplicate protection');
} finally {
  try {
    if (documentCreated) await document.delete();
  } finally {
    try {
      await app.delete();
    } finally {
      await rm(outboxDirectory, { recursive: true, force: true });
    }
  }
}
