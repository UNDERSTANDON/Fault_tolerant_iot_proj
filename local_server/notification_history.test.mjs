import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_NOTIFICATION_FIREBASE_PROJECT_ID,
  NOTIFICATION_HISTORY_COLLECTION,
  NOTIFICATION_RETENTION_MS,
  NotificationHistoryStore
} from './notification_history_store.mjs';

function createMockFirestore() {
  const collections = new Map();

  function getCollectionMap(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name);
  }

  return {
    collections,
    collection(name) {
      const colMap = getCollectionMap(name);
      return {
        doc(id) {
          return {
            async set(data, options = {}) {
              if (options.merge && colMap.has(id)) {
                colMap.set(id, { ...colMap.get(id), ...data });
              } else {
                colMap.set(id, { ...data });
              }
            },
            async delete() {
              colMap.delete(id);
            },
            async get() {
              const found = colMap.get(id);
              return {
                exists: Boolean(found),
                id,
                data: () => found
              };
            }
          };
        },
        where(field, op, value) {
          return {
            async get() {
              const docs = [];
              for (const [docId, docData] of colMap.entries()) {
                if (op === '<=' && Number(docData?.[field]) <= value) {
                  docs.push({
                    id: docId,
                    data: () => docData
                  });
                }
              }
              return { docs };
            }
          };
        },
        async get() {
          const docs = [];
          for (const [docId, docData] of colMap.entries()) {
            docs.push({
              id: docId,
              data: () => docData
            });
          }
          return { docs };
        }
      };
    }
  };
}

test('NotificationHistoryStore persists to Firebase testprojectesp32s3forfirebase and auto-deletes records older than 30 days', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'notif-history-test-'));
  try {
    const storageFilePath = path.join(tempDir, 'notification-history.json');
    const mockFirestore = createMockFirestore();
    const store = new NotificationHistoryStore({
      storageFilePath,
      projectId: DEFAULT_NOTIFICATION_FIREBASE_PROJECT_ID,
      firestoreClient: mockFirestore
    });

    const now = Date.now();
    const thirtyOneDaysAgo = now - NOTIFICATION_RETENTION_MS - (24 * 60 * 60 * 1000);
    const tenDaysAgo = now - (10 * 24 * 60 * 60 * 1000);

    // Seed an expired notification directly into mock Firestore and local store
    const expiredId = 'notif-expired-31d';
    await mockFirestore.collection(NOTIFICATION_HISTORY_COLLECTION).doc(expiredId).set({
      id: expiredId,
      projectId: DEFAULT_NOTIFICATION_FIREBASE_PROJECT_ID,
      type: 'warning',
      category: 'network',
      titleKey: 'notifications.wanLostTitle',
      messageKey: 'notifications.wanLostMsg',
      title: 'Internet Uplink Lost (31d old)',
      message: 'Switching control path to autonomous Local LAN...',
      createdAtMs: thirtyOneDaysAgo,
      expiresAtMs: thirtyOneDaysAgo + NOTIFICATION_RETENTION_MS,
      syncedToFirebase: true
    });
    store.records.push({
      id: expiredId,
      projectId: DEFAULT_NOTIFICATION_FIREBASE_PROJECT_ID,
      type: 'warning',
      category: 'network',
      titleKey: 'notifications.wanLostTitle',
      messageKey: 'notifications.wanLostMsg',
      title: 'Internet Uplink Lost (31d old)',
      message: 'Switching control path to autonomous Local LAN...',
      source: 'SafeHaven Local-First',
      createdAtMs: thirtyOneDaysAgo,
      expiresAtMs: thirtyOneDaysAgo + NOTIFICATION_RETENTION_MS,
      createdAtIso: new Date(thirtyOneDaysAgo).toISOString(),
      expiresAtIso: new Date(thirtyOneDaysAgo + NOTIFICATION_RETENTION_MS).toISOString(),
      syncedToFirebase: true
    });

    // Add a valid 10-day-old notification and a brand-new notification
    await store.addNotification(
      {
        id: 'notif-recent-10d',
        type: 'error',
        category: 'hazard',
        titleKey: 'notifications.smokeCriticalTitle',
        messageKey: 'notifications.smokeCriticalMsg',
        title: 'CRITICAL HAZARD: Smoke Detected (MQ-2)',
        message: 'Live MQ-2 ADC reading on GPIO1 exceeded configured safety threshold.',
        source: 'ESP32-S3 Live (MQ-2)',
        createdAtMs: tenDaysAgo
      },
      now
    );

    await store.addNotification(
      {
        id: 'notif-fresh-now',
        type: 'success',
        category: 'device',
        titleKey: 'notifications.cmdSuccessTitle',
        params: {
          deviceId: 'living_light',
          device: 'Ceiling Light',
          actionKey: 'notifications.actionTurnedOn',
          ackKey: 'notifications.ackMqttBridge',
          pin: 5
        },
        title: 'Ceiling Light turned ON',
        message: 'MQTT Bridge -> ESP32-S3 GPIO5',
        source: 'ESP32-S3 Live',
        createdAtMs: now
      },
      now
    );

    const listed = await store.listNotifications(now);
    assert.equal(listed.projectId, 'testprojectesp32s3forfirebase');
    assert.equal(listed.firebaseConnected, true);
    assert.equal(listed.retentionDays, 30);
    assert.equal(listed.notifications.length, 2);
    assert.deepEqual(
      listed.notifications.map((item) => item.id),
      ['notif-fresh-now', 'notif-recent-10d']
    );
    assert.equal(listed.notifications[0].syncedToFirebase, true);
    assert.equal(listed.notifications[0].daysRemaining, 30);
    assert.equal(listed.notifications[1].daysRemaining, 20);

    // Verify expired record was purged from Firestore collection too
    const firestoreMap = mockFirestore.collections.get(NOTIFICATION_HISTORY_COLLECTION);
    assert.equal(firestoreMap.has(expiredId), false);
    assert.equal(firestoreMap.has('notif-recent-10d'), true);
    assert.equal(firestoreMap.has('notif-fresh-now'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('NotificationHistoryStore buffers locally when offline and auto-pushes to Firestore once connected, plus supports admin delete and clearAll', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'notif-buffer-test-'));
  try {
    const storageFilePath = path.join(tempDir, 'notification-history.json');
    const store = new NotificationHistoryStore({
      storageFilePath,
      projectId: DEFAULT_NOTIFICATION_FIREBASE_PROJECT_ID,
      credentialsPath: path.join(tempDir, 'missing-service-account.json')
    });

    const now = Date.now();
    const buffered = await store.addNotification(
      {
        id: 'notif-buffered-1',
        type: 'warning',
        category: 'network',
        titleKey: 'notifications.lanFallbackTitle',
        messageKey: 'notifications.lanFallbackMsg',
        params: { ms: 185 },
        title: 'LOCAL MODE Engaged',
        message: 'Failover complete in 185ms.'
      },
      now
    );

    assert.equal(buffered.syncedToFirebase, false);
    assert.equal(store.getStatus().firebaseConnected, false);
    assert.equal(store.getStatus().pendingSyncCount, 1);

    // Simulate Firestore becoming available (e.g. service-account.json placed on disk)
    const mockFirestore = createMockFirestore();
    store.firestore = mockFirestore;

    const syncResult = await store.syncPendingToFirebase(now);
    assert.equal(syncResult.syncedCount, 1);
    assert.equal(syncResult.firebaseConnected, true);

    const firestoreMap = mockFirestore.collections.get(NOTIFICATION_HISTORY_COLLECTION);
    assert.equal(firestoreMap.has('notif-buffered-1'), true);
    assert.equal(store.getStatus().pendingSyncCount, 0);

    // Add second notification and test individual delete
    await store.addNotification(
      {
        id: 'notif-buffered-2',
        type: 'info',
        category: 'system',
        titleKey: 'notifications.langChangedTitle',
        messageKey: 'notifications.langChangedMsg',
        params: { lang: 'Tiếng Việt' },
        title: 'Language Updated'
      },
      now + 1000
    );
    assert.equal(firestoreMap.size, 2);

    const delSingle = await store.deleteNotification('notif-buffered-1');
    assert.equal(delSingle.deleted, true);
    assert.equal(delSingle.remainingCount, 1);
    assert.equal(firestoreMap.has('notif-buffered-1'), false);

    // Test clearAll
    const cleared = await store.clearAll();
    assert.equal(cleared.clearedLocal, 1);
    assert.equal(cleared.remainingCount, 0);
    assert.equal(firestoreMap.size, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
