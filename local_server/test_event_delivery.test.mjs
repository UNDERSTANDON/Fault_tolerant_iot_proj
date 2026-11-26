import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  TEST_NOTIFICATION_TOPIC,
  TestEventDeliveryWorker,
  TestEventOutbox,
  createFirestoreTestWriter,
  validateTestNotification
} from './test_event_delivery.mjs';

function makeEvent(overrides = {}) {
  return {
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
    timestamp_kind: 'device_uptime_ms',
    ...overrides
  };
}

async function withOutbox(t, callback, options) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'iot-test-event-outbox-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outbox = new TestEventOutbox(directory, options);
  await outbox.initialize();
  await callback(outbox, directory);
}

test('validates only the synthetic notification topic and exact event shape', () => {
  const event = makeEvent();
  assert.equal(validateTestNotification(TEST_NOTIFICATION_TOPIC, event), event);
  assert.throws(() => validateTestNotification('events/production', event), /topic/);
  assert.throws(() => validateTestNotification(TEST_NOTIFICATION_TOPIC, {
    ...event,
    is_test: false
  }), /markers/);
  assert.throws(() => validateTestNotification(TEST_NOTIFICATION_TOPIC, {
    ...event,
    event_id: 'different'
  }), /identity/);
  assert.throws(() => validateTestNotification(TEST_NOTIFICATION_TOPIC, {
    ...event,
    sensor_value: 42
  }), /fields/);
});

test('durably queues an event once and rejects conflicting IDs and overflow', async (t) => {
  await withOutbox(t, async (outbox) => {
    const event = makeEvent();
    assert.deepEqual(await outbox.enqueue(event, 1000), { duplicate: false });
    assert.deepEqual(await outbox.enqueue(event, 1001), { duplicate: true });
    assert.equal((await outbox.getStatus(2000)).pending, 1);
    await assert.rejects(
      outbox.enqueue(makeEvent({ message: 'Different content with same ID.' }), 1002),
      { code: 'event-id-collision' }
    );
    await assert.rejects(
      outbox.enqueue(makeEvent({
        event_id: 'aabbccddeeff-0011223344556677-2',
        sequence: 2
      }), 1003),
      { code: 'outbox-full' }
    );
  }, { maxEntries: 1 });
});

test('queued events survive outbox reinitialization', async (t) => {
  await withOutbox(t, async (outbox, directory) => {
    await outbox.enqueue(makeEvent(), 1000);
    const restartedOutbox = new TestEventOutbox(directory);
    await restartedOutbox.initialize();
    assert.equal((await restartedOutbox.getStatus(2000)).pending, 1);
    assert.equal((await restartedOutbox.getDueEvents(1000)).length, 1);
  });
});

test('Firestore writer creates deterministic documents and accepts exact duplicates', async () => {
  const documents = new Map();
  const firestore = {
    collection(name) {
      assert.equal(name, 'testEventNotifications');
      return {
        doc(id) {
          return {
            async create(event) {
              if (documents.has(id)) {
                const error = new Error('Already exists');
                error.code = 6;
                throw error;
              }
              documents.set(id, event);
            },
            async get() {
              return {
                exists: documents.has(id),
                data: () => documents.get(id)
              };
            }
          };
        }
      };
    }
  };
  const writer = createFirestoreTestWriter(firestore);
  const event = makeEvent();
  assert.deepEqual(await writer(event), { duplicate: false });
  assert.deepEqual(await writer(event), { duplicate: true });
  assert.equal(documents.size, 1);
  await assert.rejects(writer(makeEvent({ message: 'Collision.' })), {
    code: 'event-id-collision'
  });
});

test('delivery worker writes queued events before clearing the local outbox', async (t) => {
  const documents = new Map();
  const firestore = {
    collection() {
      return {
        doc(id) {
          return {
            async create(event) {
              if (documents.has(id)) {
                const error = new Error('Already exists');
                error.code = 6;
                throw error;
              }
              documents.set(id, event);
            },
            async get() {
              return {
                exists: documents.has(id),
                data: () => documents.get(id)
              };
            }
          };
        }
      };
    }
  };
  await withOutbox(t, async (outbox) => {
    const event = makeEvent();
    const writes = [];
    const baseWriter = createFirestoreTestWriter(firestore);
    const worker = new TestEventDeliveryWorker({
      outbox,
      writer: async (queuedEvent) => {
        const result = await baseWriter(queuedEvent);
        writes.push(result);
        return result;
      },
      logger: { info() {}, error() {} }
    });

    await outbox.enqueue(event, 1000);
    await worker.runOnce(1000);
    assert.equal((await outbox.getStatus(1001)).pending, 0);
    assert.deepEqual(documents.get(event.event_id), event);

    await outbox.enqueue(event, 1002);
    await worker.runOnce(1002);
    assert.equal((await outbox.getStatus(1003)).pending, 0);
    assert.equal(documents.size, 1);
    assert.deepEqual(writes, [{ duplicate: false }, { duplicate: true }]);
  });
});

test('worker retries transient failures and quarantines permanent Firebase errors', async (t) => {
  await withOutbox(t, async (outbox) => {
    const logs = [];
    const logger = {
      info: (message) => logs.push(message),
      error: (message) => logs.push(message)
    };
    await outbox.enqueue(makeEvent(), 1000);
    const transientWorker = new TestEventDeliveryWorker({
      outbox,
      writer: async () => {
        const error = new Error('Unavailable');
        error.code = 'unavailable';
        throw error;
      },
      logger
    });
    await transientWorker.runOnce(1000);
    assert.equal((await outbox.getStatus(1001)).pending, 1);
    assert.equal((await outbox.getDueEvents(1001)).length, 0);

    const permanentWorker = new TestEventDeliveryWorker({
      outbox,
      writer: async () => {
        const error = new Error('Permission denied');
        error.code = 'permission-denied';
        throw error;
      },
      logger
    });
    await permanentWorker.runOnce(3000);
    const status = await outbox.getStatus(3001);
    assert.equal(status.pending, 0);
    assert.equal(status.quarantined, 1);
    assert.deepEqual(await outbox.enqueue(makeEvent(), 3002), {
      duplicate: true,
      quarantined: true
    });
    assert.equal(logs.length, 2);
  });
});
