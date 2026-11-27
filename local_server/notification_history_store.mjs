import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

export const DEFAULT_NOTIFICATION_FIREBASE_PROJECT_ID = 'testprojectesp32s3forfirebase';
export const NOTIFICATION_HISTORY_COLLECTION = 'notificationHistory';
export const NOTIFICATION_RETENTION_DAYS = 30;
export const NOTIFICATION_RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const MAX_NOTIFICATION_HISTORY_ITEMS = 500;

const ALLOWED_TYPES = new Set(['error', 'warning', 'success', 'info']);
const ALLOWED_CATEGORIES = new Set(['hazard', 'device', 'network', 'system']);

function isWithinDirectory(parentDir, targetPath) {
  const relative = path.relative(parentDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sanitizeParams(rawParams) {
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    return undefined;
  }
  const clean = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) continue;
    if (typeof value === 'string') {
      clean[key] = value.slice(0, 160);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === 'boolean') {
      clean[key] = value;
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function inferCategory({ category, type, titleKey, messageKey }) {
  if (ALLOWED_CATEGORIES.has(category)) {
    return category;
  }
  const combinedKey = `${titleKey || ''} ${messageKey || ''}`.toLowerCase();
  if (combinedKey.includes('smoke') || combinedKey.includes('hazard')) {
    return 'hazard';
  }
  if (combinedKey.includes('cmd') || combinedKey.includes('device') || combinedKey.includes('action')) {
    return 'device';
  }
  if (
    combinedKey.includes('wan')
    || combinedKey.includes('lan')
    || combinedKey.includes('cloud')
    || combinedKey.includes('baseline')
  ) {
    return 'network';
  }
  if (type === 'error') {
    return 'hazard';
  }
  return 'system';
}

export class NotificationHistoryStore {
  constructor({
    storageFilePath,
    projectId = DEFAULT_NOTIFICATION_FIREBASE_PROJECT_ID,
    credentialsPath = '',
    repositoryRoot = '',
    retentionMs = NOTIFICATION_RETENTION_MS,
    maxItems = MAX_NOTIFICATION_HISTORY_ITEMS,
    firestoreClient = null
  }) {
    if (!storageFilePath) {
      throw new Error('NotificationHistoryStore requires a storageFilePath.');
    }
    this.storageFilePath = path.resolve(storageFilePath);
    this.projectId = (projectId || DEFAULT_NOTIFICATION_FIREBASE_PROJECT_ID).trim();
    this.credentialsPath = credentialsPath ? path.resolve(credentialsPath) : '';
    this.repositoryRoot = repositoryRoot ? path.resolve(repositoryRoot) : '';
    this.retentionMs = Number.isFinite(retentionMs) && retentionMs > 0
      ? retentionMs
      : NOTIFICATION_RETENTION_MS;
    this.retentionDays = Math.max(1, Math.round(this.retentionMs / (24 * 60 * 60 * 1000)));
    this.maxItems = Number.isInteger(maxItems) && maxItems > 0
      ? maxItems
      : MAX_NOTIFICATION_HISTORY_ITEMS;
    this.firestore = firestoreClient;
    this.firebaseError = null;
    this.lastPurgeAtIso = null;
    this.lastSyncAtIso = null;
    this.records = this.#loadFromDisk();
  }

  #loadFromDisk() {
    if (!existsSync(this.storageFilePath)) {
      return [];
    }
    try {
      const parsed = JSON.parse(readFileSync(this.storageFilePath, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.notifications) ? parsed.notifications : [];
      return list
        .filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
        .map((item) => this.#normalizeExistingRecord(item));
    } catch {
      return [];
    }
  }

  #saveToDisk() {
    mkdirSync(path.dirname(this.storageFilePath), { recursive: true });
    const tempPath = `${this.storageFilePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(
      tempPath,
      JSON.stringify(
        {
          projectId: this.projectId,
          retentionDays: this.retentionDays,
          updatedAtIso: new Date().toISOString(),
          notifications: this.records
        },
        null,
        2
      ),
      'utf8'
    );
    renameSync(tempPath, this.storageFilePath);
  }

  #normalizeExistingRecord(raw, fallbackNow = Date.now()) {
    const createdAtMs = Number.isFinite(raw.createdAtMs)
      ? Math.trunc(raw.createdAtMs)
      : fallbackNow;
    const expiresAtMs = Number.isFinite(raw.expiresAtMs)
      ? Math.trunc(raw.expiresAtMs)
      : createdAtMs + this.retentionMs;
    const type = ALLOWED_TYPES.has(raw.type) ? raw.type : 'info';
    const titleKey = typeof raw.titleKey === 'string' && raw.titleKey.trim()
      ? raw.titleKey.trim().slice(0, 120)
      : undefined;
    const messageKey = typeof raw.messageKey === 'string' && raw.messageKey.trim()
      ? raw.messageKey.trim().slice(0, 120)
      : undefined;
    const category = inferCategory({
      category: raw.category,
      type,
      titleKey,
      messageKey
    });

    return {
      id: String(raw.id).slice(0, 96),
      projectId: this.projectId,
      type,
      category,
      ...(titleKey ? { titleKey } : {}),
      ...(messageKey ? { messageKey } : {}),
      ...(sanitizeParams(raw.params) ? { params: sanitizeParams(raw.params) } : {}),
      ...(Number.isFinite(raw.appendLatencyMs) ? { appendLatencyMs: Math.round(raw.appendLatencyMs) } : {}),
      title: typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim().slice(0, 200)
        : (titleKey || 'SafeHaven Notification'),
      message: typeof raw.message === 'string' && raw.message.trim()
        ? raw.message.trim().slice(0, 400)
        : (messageKey || ''),
      source: typeof raw.source === 'string' && raw.source.trim()
        ? raw.source.trim().slice(0, 80)
        : 'SafeHaven Local-First',
      createdAtMs,
      expiresAtMs,
      createdAtIso: new Date(createdAtMs).toISOString(),
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      syncedToFirebase: Boolean(raw.syncedToFirebase),
      ...(raw.syncedAtIso ? { syncedAtIso: raw.syncedAtIso } : {})
    };
  }

  isRecordExpired(record, now = Date.now()) {
    if (!record || typeof record !== 'object') return true;
    const expiresAtMs = Number.isFinite(record.expiresAtMs)
      ? record.expiresAtMs
      : (Number.isFinite(record.createdAtMs) ? record.createdAtMs + this.retentionMs : 0);
    return expiresAtMs <= now || (Number.isFinite(record.createdAtMs) && now - record.createdAtMs >= this.retentionMs);
  }

  ensureFirestoreClient() {
    if (this.firestore) {
      return this.firestore;
    }
    if (!this.credentialsPath || !existsSync(this.credentialsPath)) {
      this.firebaseError = 'Service account key file not found at configured path.';
      return null;
    }
    if (this.repositoryRoot && isWithinDirectory(this.repositoryRoot, this.credentialsPath)) {
      this.firebaseError = 'Service account key file must be stored outside the repository directory.';
      return null;
    }

    try {
      const serviceAccount = JSON.parse(readFileSync(this.credentialsPath, 'utf8'));
      if (serviceAccount.project_id && serviceAccount.project_id !== this.projectId) {
        this.firebaseError = `Service account project_id (${serviceAccount.project_id}) does not match ${this.projectId}.`;
        return null;
      }
      const appName = `safehaven-notification-history-${this.projectId}`;
      const existingApp = getApps().find((candidate) => candidate.name === appName);
      const app = existingApp || initializeApp(
        {
          credential: cert(serviceAccount),
          projectId: this.projectId
        },
        appName
      );
      this.firestore = getFirestore(app);
      this.firebaseError = null;
      return this.firestore;
    } catch (error) {
      this.firebaseError = error?.message || 'Unable to initialize Firebase Admin Firestore client.';
      return null;
    }
  }

  getStatus() {
    const credentialsFound = Boolean(this.credentialsPath && existsSync(this.credentialsPath));
    const client = this.ensureFirestoreClient();
    const pendingSyncCount = this.records.filter((item) => !item.syncedToFirebase).length;
    return {
      projectId: this.projectId,
      collection: NOTIFICATION_HISTORY_COLLECTION,
      retentionDays: this.retentionDays,
      firebaseConnected: Boolean(client),
      credentialsFound,
      credentialsPath: this.credentialsPath,
      firebaseError: client ? null : this.firebaseError,
      totalCount: this.records.length,
      pendingSyncCount,
      lastPurgeAtIso: this.lastPurgeAtIso,
      lastSyncAtIso: this.lastSyncAtIso
    };
  }

  async #writeRecordToFirestore(record, now = Date.now()) {
    const client = this.ensureFirestoreClient();
    if (!client) {
      return false;
    }
    try {
      const syncedAtIso = new Date(now).toISOString();
      const docPayload = {
        ...record,
        projectId: this.projectId,
        syncedToFirebase: true,
        syncedAtIso,
        expiresAt: Timestamp.fromMillis(record.expiresAtMs)
      };
      await client
        .collection(NOTIFICATION_HISTORY_COLLECTION)
        .doc(record.id)
        .set(docPayload, { merge: true });
      record.syncedToFirebase = true;
      record.syncedAtIso = syncedAtIso;
      this.lastSyncAtIso = syncedAtIso;
      return true;
    } catch (error) {
      this.firebaseError = error?.message || 'Firestore write failed.';
      return false;
    }
  }

  async addNotification(input = {}, now = Date.now()) {
    const createdAtMs = Number.isFinite(input.createdAtMs)
      ? Math.trunc(input.createdAtMs)
      : now;
    const rawId = typeof input.id === 'string' && /^[a-zA-Z0-9_-]{4,96}$/.test(input.id.trim())
      ? input.id.trim()
      : `notif-${createdAtMs}-${randomBytes(4).toString('hex')}`;

    const record = this.#normalizeExistingRecord(
      {
        ...input,
        id: rawId,
        createdAtMs,
        expiresAtMs: createdAtMs + this.retentionMs,
        syncedToFirebase: false
      },
      now
    );

    // Automatically prune any expired notifications (> 30 days)
    this.records = this.records.filter((item) => !this.isRecordExpired(item, now));

    if (!this.isRecordExpired(record, now)) {
      const existingIndex = this.records.findIndex((item) => item.id === record.id);
      if (existingIndex >= 0) {
        this.records[existingIndex] = {
          ...this.records[existingIndex],
          ...record,
          syncedToFirebase: this.records[existingIndex].syncedToFirebase
        };
      } else {
        this.records.unshift(record);
      }
      this.records.sort((a, b) => b.createdAtMs - a.createdAtMs);
      if (this.records.length > this.maxItems) {
        this.records = this.records.slice(0, this.maxItems);
      }
      this.#saveToDisk();

      const targetRecord = this.records.find((item) => item.id === record.id) || record;
      const synced = await this.#writeRecordToFirestore(targetRecord, now);
      if (synced) {
        this.#saveToDisk();
      }
      return targetRecord;
    }

    this.#saveToDisk();
    return record;
  }

  async purgeExpired(now = Date.now()) {
    const beforeCount = this.records.length;
    this.records = this.records.filter((item) => !this.isRecordExpired(item, now));
    const purgedLocal = beforeCount - this.records.length;
    if (purgedLocal > 0) {
      this.#saveToDisk();
    }

    let purgedFirebase = 0;
    const client = this.ensureFirestoreClient();
    if (client) {
      try {
        const colRef = client.collection(NOTIFICATION_HISTORY_COLLECTION);
        if (typeof colRef.where === 'function') {
          const snapshot = await colRef.where('expiresAtMs', '<=', now).get();
          const docs = snapshot?.docs || [];
          for (const docSnap of docs) {
            await colRef.doc(docSnap.id).delete();
            purgedFirebase += 1;
          }
        } else if (typeof colRef.get === 'function') {
          const snapshot = await colRef.get();
          const docs = snapshot?.docs || [];
          for (const docSnap of docs) {
            const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;
            if (this.isRecordExpired(data, now)) {
              await colRef.doc(docSnap.id).delete();
              purgedFirebase += 1;
            }
          }
        }
      } catch (error) {
        this.firebaseError = error?.message || 'Firestore expired cleanup failed.';
      }
    }

    this.lastPurgeAtIso = new Date(now).toISOString();
    return {
      purgedLocal,
      purgedFirebase,
      remainingCount: this.records.length,
      purgedAtIso: this.lastPurgeAtIso
    };
  }

  async syncPendingToFirebase(now = Date.now()) {
    const client = this.ensureFirestoreClient();
    if (!client) {
      return { syncedCount: 0, firebaseConnected: false };
    }

    let syncedCount = 0;
    for (const record of this.records) {
      if (this.isRecordExpired(record, now)) continue;
      if (!record.syncedToFirebase) {
        const ok = await this.#writeRecordToFirestore(record, now);
        if (ok) {
          syncedCount += 1;
        }
      }
    }

    // Also reconcile recent remote records from Firestore (if collection.get is supported)
    try {
      const colRef = client.collection(NOTIFICATION_HISTORY_COLLECTION);
      if (typeof colRef.get === 'function') {
        const snapshot = await colRef.get();
        const docs = snapshot?.docs || [];
        let changedLocal = syncedCount > 0;
        const localById = new Map(this.records.map((item) => [item.id, item]));
        for (const docSnap of docs) {
          const rawData = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;
          if (!rawData || typeof rawData !== 'object') continue;
          const normalized = this.#normalizeExistingRecord(
            { ...rawData, id: rawData.id || docSnap.id, syncedToFirebase: true },
            now
          );
          if (this.isRecordExpired(normalized, now)) {
            await colRef.doc(normalized.id).delete();
            continue;
          }
          if (!localById.has(normalized.id)) {
            this.records.push(normalized);
            localById.set(normalized.id, normalized);
            changedLocal = true;
          }
        }
        if (changedLocal) {
          this.records.sort((a, b) => b.createdAtMs - a.createdAtMs);
          if (this.records.length > this.maxItems) {
            this.records = this.records.slice(0, this.maxItems);
          }
          this.#saveToDisk();
        }
      } else if (syncedCount > 0) {
        this.#saveToDisk();
      }
    } catch (error) {
      if (syncedCount > 0) {
        this.#saveToDisk();
      }
      this.firebaseError = error?.message || 'Firestore reconciliation failed.';
    }

    return {
      syncedCount,
      firebaseConnected: Boolean(this.firestore)
    };
  }

  async listNotifications(now = Date.now()) {
    await this.purgeExpired(now);
    await this.syncPendingToFirebase(now);
    return {
      ...this.getStatus(),
      notifications: this.records.map((item) => ({
        ...item,
        daysRemaining: Math.max(1, Math.ceil((item.expiresAtMs - now) / (24 * 60 * 60 * 1000)))
      }))
    };
  }

  async deleteNotification(id) {
    const cleanId = typeof id === 'string' ? id.trim() : '';
    if (!cleanId) {
      return { deleted: false };
    }
    const beforeCount = this.records.length;
    this.records = this.records.filter((item) => item.id !== cleanId);
    const deletedLocal = this.records.length < beforeCount;
    if (deletedLocal) {
      this.#saveToDisk();
    }

    let deletedFirebase = false;
    const client = this.ensureFirestoreClient();
    if (client) {
      try {
        await client.collection(NOTIFICATION_HISTORY_COLLECTION).doc(cleanId).delete();
        deletedFirebase = true;
      } catch (error) {
        this.firebaseError = error?.message || 'Firestore document deletion failed.';
      }
    }

    return {
      deleted: deletedLocal || deletedFirebase,
      deletedLocal,
      deletedFirebase,
      remainingCount: this.records.length
    };
  }

  async clearAll() {
    const clearedLocal = this.records.length;
    const idsToDelete = this.records.map((item) => item.id);
    this.records = [];
    this.#saveToDisk();

    let clearedFirebase = 0;
    const client = this.ensureFirestoreClient();
    if (client) {
      try {
        const colRef = client.collection(NOTIFICATION_HISTORY_COLLECTION);
        if (typeof colRef.get === 'function') {
          const snapshot = await colRef.get();
          const docs = snapshot?.docs || [];
          for (const docSnap of docs) {
            await colRef.doc(docSnap.id).delete();
            clearedFirebase += 1;
          }
        } else {
          for (const id of idsToDelete) {
            await colRef.doc(id).delete();
            clearedFirebase += 1;
          }
        }
      } catch (error) {
        this.firebaseError = error?.message || 'Firestore clearAll failed.';
      }
    }

    return {
      clearedLocal,
      clearedFirebase,
      remainingCount: 0
    };
  }
}
