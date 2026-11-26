import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const TEST_NOTIFICATION_TOPIC = 'test/esp32/notifications/v1';
export const TEST_NOTIFICATION_COLLECTION = 'testEventNotifications';
export const TEST_NOTIFICATION_KIND = 'synthetic_notification';

const EVENT_ID_PATTERN = /^[0-9a-f]{12}-[0-9a-f]{16}-[1-9][0-9]{0,9}$/i;
const DEVICE_ID_PATTERN = /^[0-9a-f]{12}$/i;
const TEST_RUN_ID_PATTERN = /^[0-9a-f]{16}$/i;
const EVENT_FIELDS = [
  'schema_version',
  'kind',
  'is_test',
  'event_id',
  'source',
  'device_id',
  'test_run_id',
  'sequence',
  'severity',
  'title',
  'message',
  'timestamp_ms',
  'timestamp_kind'
];
const PERMANENT_FIRESTORE_CODES = new Set([
  'already-exists',
  'event-id-collision',
  'failed-precondition',
  'invalid-argument',
  'not-found',
  'permission-denied',
  'unauthenticated'
]);

export function validateTestNotification(topic, event) {
  if (topic !== TEST_NOTIFICATION_TOPIC) {
    throw new TypeError('Unexpected test notification topic.');
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('Test notification must be a JSON object.');
  }
  const keys = Object.keys(event).sort();
  if (!isDeepStrictEqual(keys, [...EVENT_FIELDS].sort())) {
    throw new TypeError('Test notification fields do not match the test schema.');
  }
  if (event.schema_version !== 1
    || event.kind !== TEST_NOTIFICATION_KIND
    || event.is_test !== true
    || event.source !== 'esp32_mock'
    || event.timestamp_kind !== 'device_uptime_ms') {
    throw new TypeError('Test notification markers are invalid.');
  }
  if (typeof event.device_id !== 'string' || !DEVICE_ID_PATTERN.test(event.device_id)
    || typeof event.test_run_id !== 'string' || !TEST_RUN_ID_PATTERN.test(event.test_run_id)) {
    throw new TypeError('Test notification source identity is invalid.');
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1
    || event.event_id !== `${event.device_id}-${event.test_run_id}-${event.sequence}`
    || !EVENT_ID_PATTERN.test(event.event_id)) {
    throw new TypeError('Test notification event identity is invalid.');
  }
  if (event.severity !== 'warning' && event.severity !== 'critical') {
    throw new TypeError('Test notification severity must be warning or critical.');
  }
  if (typeof event.title !== 'string' || event.title.length < 1 || event.title.length > 80
    || typeof event.message !== 'string' || event.message.length < 1 || event.message.length > 240) {
    throw new TypeError('Test notification text is invalid.');
  }
  if (!Number.isSafeInteger(event.timestamp_ms) || event.timestamp_ms < 0) {
    throw new TypeError('Test notification timestamp is invalid.');
  }
  return event;
}

function normalizedErrorCode(error) {
  const value = error?.code ?? error?.status ?? 'unknown';
  return String(value).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64) || 'unknown';
}

function isAlreadyExists(error) {
  return error?.code === 6
    || ['6', 'already-exists', 'already_exists'].includes(String(error?.code).toLowerCase());
}

function isPermanentFirestoreError(error) {
  return PERMANENT_FIRESTORE_CODES.has(normalizedErrorCode(error));
}

async function writeAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporaryPath, 'wx');
    await handle.writeFile(JSON.stringify(value), 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    if (handle) await handle.close();
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

export class TestEventOutbox {
  constructor(directory, { maxEntries = 500 } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new TypeError('Outbox maxEntries must be a positive integer.');
    }
    this.directory = directory;
    this.quarantineDirectory = path.join(directory, 'quarantine');
    this.maxEntries = maxEntries;
    this.writeChain = Promise.resolve();
  }

  pendingPath(eventId) {
    return path.join(this.directory, `${eventId}.json`);
  }

  serializeWrite(operation) {
    const result = this.writeChain.then(operation);
    this.writeChain = result.catch(() => {});
    return result;
  }

  async initialize() {
    await fs.mkdir(this.directory, { recursive: true });
    await fs.mkdir(this.quarantineDirectory, { recursive: true });
    const names = await fs.readdir(this.directory);
    for (const name of names.filter((entry) => entry.endsWith('.json'))) {
      const record = JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8'));
      validateTestNotification(TEST_NOTIFICATION_TOPIC, record.event);
      if (!Number.isSafeInteger(record.attempts) || record.attempts < 0
        || !Number.isSafeInteger(record.queuedAt) || record.queuedAt < 0
        || !Number.isSafeInteger(record.nextAttemptAt) || record.nextAttemptAt < 0) {
        throw new Error(`Invalid test event outbox record: ${name}`);
      }
    }
  }

  enqueue(event, now = Date.now()) {
    validateTestNotification(TEST_NOTIFICATION_TOPIC, event);
    return this.serializeWrite(async () => {
      const filePath = this.pendingPath(event.event_id);
      const quarantinedPath = path.join(
        this.quarantineDirectory,
        `${event.event_id}.json`
      );
      try {
        const existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
        if (!isDeepStrictEqual(existing.event, event)) {
          const collision = new Error('Event ID is already queued with different content.');
          collision.code = 'event-id-collision';
          throw collision;
        }
        return { duplicate: true };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      try {
        const quarantined = JSON.parse(await fs.readFile(quarantinedPath, 'utf8'));
        if (!isDeepStrictEqual(quarantined.event, event)) {
          const collision = new Error('Quarantined event ID has different content.');
          collision.code = 'event-id-collision';
          throw collision;
        }
        return { duplicate: true, quarantined: true };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      const pending = (await fs.readdir(this.directory))
        .filter((name) => name.endsWith('.json')).length;
      if (pending >= this.maxEntries) {
        const full = new Error('Test event outbox is full.');
        full.code = 'outbox-full';
        throw full;
      }

      await writeAtomically(filePath, {
        event,
        attempts: 0,
        queuedAt: now,
        nextAttemptAt: now
      });
      return { duplicate: false };
    });
  }

  async getDueEvents(now = Date.now(), limit = 25) {
    const names = (await fs.readdir(this.directory))
      .filter((name) => name.endsWith('.json'))
      .sort();
    const due = [];
    for (const name of names) {
      const filePath = path.join(this.directory, name);
      const record = JSON.parse(await fs.readFile(filePath, 'utf8'));
      validateTestNotification(TEST_NOTIFICATION_TOPIC, record.event);
      if (record.nextAttemptAt <= now) {
        due.push({ filePath, record });
      }
      if (due.length >= limit) break;
    }
    return due;
  }

  async markDelivered(eventId) {
    await fs.unlink(this.pendingPath(eventId));
  }

  recordFailure(eventId, error, now = Date.now()) {
    return this.serializeWrite(async () => {
      const filePath = this.pendingPath(eventId);
      const record = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const errorCode = normalizedErrorCode(error);
      if (isPermanentFirestoreError(error)) {
        await fs.rename(filePath, path.join(this.quarantineDirectory, `${eventId}.json`));
        return { quarantined: true, errorCode };
      }

      record.attempts += 1;
      const delayMs = Math.min(2000 * (2 ** Math.min(record.attempts - 1, 7)), 300000);
      record.nextAttemptAt = now + delayMs;
      record.lastErrorCode = errorCode;
      await writeAtomically(filePath, record);
      return { quarantined: false, errorCode, delayMs };
    });
  }

  async getStatus(now = Date.now()) {
    const pendingNames = (await fs.readdir(this.directory))
      .filter((name) => name.endsWith('.json'));
    const failedNames = (await fs.readdir(this.quarantineDirectory))
      .filter((name) => name.endsWith('.json'));
    let oldestPendingAgeMs = 0;
    for (const name of pendingNames) {
      const record = JSON.parse(await fs.readFile(path.join(this.directory, name), 'utf8'));
      oldestPendingAgeMs = Math.max(oldestPendingAgeMs, now - record.queuedAt);
    }
    return {
      pending: pendingNames.length,
      quarantined: failedNames.length,
      oldestPendingAgeMs
    };
  }
}

export function createFirestoreTestWriter(firestore) {
  if (!firestore || typeof firestore.collection !== 'function') {
    throw new TypeError('A Firestore client is required.');
  }

  return async (event) => {
    validateTestNotification(TEST_NOTIFICATION_TOPIC, event);
    const document = firestore.collection(TEST_NOTIFICATION_COLLECTION).doc(event.event_id);
    try {
      await document.create(event);
      return { duplicate: false };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const existing = await document.get();
      if (existing.exists && isDeepStrictEqual(existing.data(), event)) {
        return { duplicate: true };
      }
      const collision = new Error('Firestore event ID exists with different content.');
      collision.code = 'event-id-collision';
      throw collision;
    }
  };
}

export class TestEventDeliveryWorker {
  constructor({ outbox, writer, logger = console }) {
    this.outbox = outbox;
    this.writer = writer;
    this.logger = logger;
    this.running = false;
  }

  async runOnce(now = Date.now()) {
    if (this.running || typeof this.writer !== 'function') return;
    this.running = true;
    try {
      const dueEvents = await this.outbox.getDueEvents(now);
      for (const { record } of dueEvents) {
        try {
          const result = await this.writer(record.event);
          await this.outbox.markDelivered(record.event.event_id);
          this.logger.info(
            result.duplicate
              ? `Test event already exists in Firestore: ${record.event.event_id}`
              : `Test event written to Firestore: ${record.event.event_id}`
          );
        } catch (error) {
          const result = await this.outbox.recordFailure(record.event.event_id, error, now);
          this.logger.error(
            result.quarantined
              ? `Test event quarantined (${result.errorCode}): ${record.event.event_id}`
              : `Test event write deferred (${result.errorCode}): ${record.event.event_id}`
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
