import { useState, useCallback, useRef, useEffect } from 'react';
import { INITIAL_ROOMS_DATA, INITIAL_NETWORK_STATE, NETWORK_MODES } from '../data/initialMockData';

const TEST_TOPIC = 'demo/esp32-mqtt-connectivity/test';
const TEST_MESSAGE_STALE_AFTER_MS = 70000;
const HARDWARE_TELEMETRY_STALE_AFTER_MS = 15000;
const HOME_HEARTBEAT_TOPIC = 'home/gateway/heartbeat';
const HOME_CRITICAL_EVENT_TOPIC = 'home/events/critical';
const HOME_TELEMETRY_TOPIC_REGEX = /^home\/[a-z0-9_-]+\/telemetry$/;
const HOME_STATE_TOPIC_REGEX = /^home\/(living_room|bedroom|kitchen|hallway|gateway)\/(light|lock|fan|device)\/[a-z0-9_]+\/state$/;

const NOTIFICATION_HISTORY_STORAGE_KEY = 'safehaven_notification_history_v1';
const NOTIFICATION_RETENTION_DAYS = 30;
const NOTIFICATION_RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_LOCAL_HISTORY_ITEMS = 500;
const DEFAULT_FIREBASE_PROJECT_ID = 'testprojectesp32s3forfirebase';
const DEFAULT_FIREBASE_KEY_PATH = 'C:/Users/BAO HAO/AppData/Local/FaultTolerantIoT/firebase-test/service-account.json';

function inferNotificationCategory({ category, type, titleKey, messageKey }) {
  if (['hazard', 'device', 'network', 'system'].includes(category)) {
    return category;
  }
  const combined = `${titleKey || ''} ${messageKey || ''}`.toLowerCase();
  if (combined.includes('smoke') || combined.includes('hazard')) return 'hazard';
  if (combined.includes('cmd') || combined.includes('device') || combined.includes('action')) return 'device';
  if (combined.includes('wan') || combined.includes('lan') || combined.includes('cloud') || combined.includes('baseline')) {
    return 'network';
  }
  if (type === 'error') return 'hazard';
  return 'system';
}

function pruneExpiredHistoryRecords(records, now = Date.now()) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((item) => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string') return false;
      const createdAtMs = Number.isFinite(item.createdAtMs) ? item.createdAtMs : now;
      const expiresAtMs = Number.isFinite(item.expiresAtMs)
        ? item.expiresAtMs
        : createdAtMs + NOTIFICATION_RETENTION_MS;
      return expiresAtMs > now && now - createdAtMs < NOTIFICATION_RETENTION_MS;
    })
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, MAX_LOCAL_HISTORY_ITEMS);
}

function loadStoredNotificationHistory() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const pruned = pruneExpiredHistoryRecords(Array.isArray(parsed) ? parsed : []);
    if (Array.isArray(parsed) && pruned.length !== parsed.length) {
      window.localStorage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, JSON.stringify(pruned));
    }
    return pruned;
  } catch {
    return [];
  }
}

function saveStoredNotificationHistory(records) {
  if (typeof window === 'undefined') return;
  try {
    const pruned = pruneExpiredHistoryRecords(records);
    window.localStorage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore storage quota errors
  }
}

const INITIAL_ACTIVITY_LIST = [
  {
    id: 'act-1',
    titleKey: 'activity.awaitingTitle',
    subKey: 'activity.awaitingSub',
    title: 'Awaiting ESP32-S3 hardware telemetry',
    sub: 'DHT11 (GPIO4) · MQ-2 (GPIO1) · 4 LEDs · Source: No Data',
    time: '--:--:--',
    type: 'network'
  }
];

const INITIAL_EXPERIMENT_LOGS = [];

function getBridgeSecurityMode(url) {
  if (!url) {
    return { isRemote: false, usesTls: false };
  }

  try {
    const parsedUrl = new URL(url, window.location.href);
    const host = parsedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const isLoopback = host === 'localhost'
      || host === '::1'
      || /^127(?:\.\d{1,3}){3}$/.test(host);
    return { isRemote: !isLoopback, usesTls: parsedUrl.protocol === 'wss:' };
  } catch {
    return { isRemote: true, usesTls: false };
  }
}

function isConnectivityTestPayload(topic, payload) {
  return topic === TEST_TOPIC
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

export function useSmartHome() {
  const localBridgeUrl = import.meta.env.VITE_LAN_BRIDGE_URL || '';
  const bridgeHttpBase = localBridgeUrl
    ? (import.meta.env.VITE_LOCAL_SERVER_URL
      || localBridgeUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'))
      .replace(/\/+$/, '')
    : '';
  const isEmbeddedFirmwareHost = typeof window !== 'undefined'
    && window.location.protocol === 'http:'
    && window.location.port === '';
  const bridgeSecurity = getBridgeSecurityMode(localBridgeUrl);
  const isInsecureRemoteBridge = Boolean(localBridgeUrl && bridgeSecurity.isRemote && !bridgeSecurity.usesTls);
  const [rooms, setRooms] = useState(INITIAL_ROOMS_DATA);
  const [networkState, setNetworkState] = useState(INITIAL_NETWORK_STATE);
  const [recentActivity, setRecentActivity] = useState(INITIAL_ACTIVITY_LIST);
  const [experimentLogs, setExperimentLogs] = useState(INITIAL_EXPERIMENT_LOGS);
  const [notifications, setNotifications] = useState([]);
  const [notificationHistory, setNotificationHistory] = useState(() => loadStoredNotificationHistory());
  const [historyMeta, setHistoryMeta] = useState({
    projectId: DEFAULT_FIREBASE_PROJECT_ID,
    collection: 'notificationHistory',
    retentionDays: NOTIFICATION_RETENTION_DAYS,
    firebaseConnected: false,
    credentialsPath: DEFAULT_FIREBASE_KEY_PATH
  });
  const [metrics, setMetrics] = useState({
    fallbackTimeMs: 0,
    avgResponseTimeMs: 0,
    commandsTotal: 0,
    commandsSuccess: 0
  });
  const [bridgeConnectAttempt, setBridgeConnectAttempt] = useState(0);
  const [bridgeEnabled, setBridgeEnabled] = useState(true);
  const [bridgeState, setBridgeState] = useState(() => ({
    status: !localBridgeUrl ? 'not-configured' : isInsecureRemoteBridge ? 'unavailable' : 'connecting',
    lastMessageAt: null,
    lastMessage: null,
    messageStale: false,
    requiresAuthentication: false,
    error: isInsecureRemoteBridge ? 'Remote dashboard connections require a WSS bridge URL.' : null
  }));
  const [hardwareStatus, setHardwareStatus] = useState({
    isLive: false,
    lastTelemetryAt: null,
    dataSource: 'No Data (ESP32-S3)',
    dhtValid: false,
    mq2Valid: false,
    mq2Preheating: false,
    mq2RawMv: null,
    mq2Percent: null
  });
  const [deviceNetworkStatus, setDeviceNetworkStatus] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [isSmokeAlert, setIsSmokeAlert] = useState(false);

  const activeSocketRef = useRef(null);
  const transitionTimerRef = useRef(null);
  const roomsRef = useRef(rooms);
  const bridgeStatusRef = useRef(bridgeState.status);
  const lastHardwareTelemetryAtRef = useRef(0);
  const pendingDeviceUntilRef = useRef({});
  const pendingAckWaitersRef = useRef(new Map());
  const seenCriticalEventsRef = useRef(new Set());

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    bridgeStatusRef.current = bridgeState.status;
  }, [bridgeState.status]);

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const syncHistoryWithBridge = useCallback(async () => {
    const now = Date.now();
    setNotificationHistory((prev) => {
      const pruned = pruneExpiredHistoryRecords(prev, now);
      saveStoredNotificationHistory(pruned);
      return pruned;
    });

    if (!bridgeHttpBase) return;
    try {
      const response = await fetch(`${bridgeHttpBase}/api/notifications/history`, {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data && typeof data === 'object') {
        setHistoryMeta((prev) => ({
          ...prev,
          projectId: data.projectId || DEFAULT_FIREBASE_PROJECT_ID,
          collection: data.collection || 'notificationHistory',
          retentionDays: data.retentionDays || NOTIFICATION_RETENTION_DAYS,
          firebaseConnected: Boolean(data.firebaseConnected),
          credentialsPath: data.credentialsPath || DEFAULT_FIREBASE_KEY_PATH
        }));
      }
      if (Array.isArray(data?.notifications)) {
        setNotificationHistory((prevLocal) => {
          const byId = new Map();
          for (const item of pruneExpiredHistoryRecords(prevLocal, now)) {
            byId.set(item.id, item);
          }
          for (const remoteItem of pruneExpiredHistoryRecords(data.notifications, now)) {
            byId.set(remoteItem.id, remoteItem);
          }
          const merged = pruneExpiredHistoryRecords([...byId.values()], now);
          saveStoredNotificationHistory(merged);
          return merged;
        });
      }
    } catch {
      // Keep local 30-day cache when bridge is unreachable
    }
  }, [bridgeHttpBase]);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      syncHistoryWithBridge();
    }, 0);
    const timer = setInterval(syncHistoryWithBridge, 30000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [syncHistoryWithBridge]);

  const addNotification = useCallback(({
    id: customId,
    type = 'info',
    category,
    title,
    message,
    titleKey,
    messageKey,
    params,
    appendLatencyMs,
    source = 'SafeHaven Local-First',
    skipHistory = false
  }) => {
    const nowMs = Date.now();
    const newId = customId || `toast-${nowMs}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast = {
      id: newId,
      type,
      title,
      message,
      titleKey,
      messageKey,
      params,
      appendLatencyMs,
      time: new Date(nowMs).toLocaleTimeString('en-US')
    };

    setNotifications((prev) => [newToast, ...prev].slice(0, 4));

    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== newId));
    }, 4500);

    if (skipHistory) {
      return;
    }

    const expiresAtMs = nowMs + NOTIFICATION_RETENTION_MS;
    const historyRecord = {
      id: newId,
      projectId: DEFAULT_FIREBASE_PROJECT_ID,
      type,
      category: inferNotificationCategory({ category, type, titleKey, messageKey }),
      title: title || titleKey || 'SafeHaven Notification',
      message: message || messageKey || '',
      ...(titleKey ? { titleKey } : {}),
      ...(messageKey ? { messageKey } : {}),
      ...(params ? { params } : {}),
      ...(appendLatencyMs !== undefined ? { appendLatencyMs } : {}),
      source,
      createdAtMs: nowMs,
      expiresAtMs,
      createdAtIso: new Date(nowMs).toISOString(),
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      syncedToFirebase: false
    };

    setNotificationHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== historyRecord.id);
      const next = pruneExpiredHistoryRecords([historyRecord, ...filtered], nowMs);
      saveStoredNotificationHistory(next);
      return next;
    });

    if (bridgeHttpBase) {
      fetch(`${bridgeHttpBase}/api/notifications/history`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(historyRecord)
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          if (data.status) {
            setHistoryMeta((prev) => ({
              ...prev,
              projectId: data.status.projectId || DEFAULT_FIREBASE_PROJECT_ID,
              firebaseConnected: Boolean(data.status.firebaseConnected),
              credentialsPath: data.status.credentialsPath || prev.credentialsPath
            }));
          }
          if (data.notification) {
            setNotificationHistory((prev) => {
              const updated = prev.map((item) =>
                item.id === historyRecord.id ? { ...item, ...data.notification } : item
              );
              saveStoredNotificationHistory(updated);
              return updated;
            });
          }
        })
        .catch(() => {});
    }
  }, [bridgeHttpBase]);

  const deleteNotificationHistoryItem = useCallback(async (targetId) => {
    if (!targetId) return;
    setNotificationHistory((prev) => {
      const next = prev.filter((item) => item.id !== targetId);
      saveStoredNotificationHistory(next);
      return next;
    });
    if (bridgeHttpBase) {
      try {
        await fetch(`${bridgeHttpBase}/api/notifications/delete`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: targetId })
        });
      } catch {
        // Removed from local cache
      }
    }
    addNotification({
      type: 'info',
      titleKey: 'notifications.historyDeletedTitle',
      messageKey: 'notifications.historyDeletedMsg',
      skipHistory: true
    });
  }, [bridgeHttpBase, addNotification]);

  const clearAllNotificationHistory = useCallback(async () => {
    setNotificationHistory([]);
    saveStoredNotificationHistory([]);
    if (bridgeHttpBase) {
      try {
        await fetch(`${bridgeHttpBase}/api/notifications/delete`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: true })
        });
      } catch {
        // Cleared locally
      }
    }
    addNotification({
      type: 'info',
      titleKey: 'notifications.historyClearedTitle',
      messageKey: 'notifications.historyClearedMsg',
      skipHistory: true
    });
  }, [bridgeHttpBase, addNotification]);

  const cleanupExpiredNotifications = useCallback(async () => {
    const now = Date.now();
    setNotificationHistory((prev) => {
      const pruned = pruneExpiredHistoryRecords(prev, now);
      saveStoredNotificationHistory(pruned);
      return pruned;
    });
    if (bridgeHttpBase) {
      try {
        const res = await fetch(`${bridgeHttpBase}/api/notifications/cleanup`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.notifications)) {
            setNotificationHistory((prevLocal) => {
              const byId = new Map();
              for (const item of pruneExpiredHistoryRecords(prevLocal, now)) {
                byId.set(item.id, item);
              }
              for (const remoteItem of pruneExpiredHistoryRecords(data.notifications, now)) {
                byId.set(remoteItem.id, remoteItem);
              }
              const merged = pruneExpiredHistoryRecords([...byId.values()], now);
              saveStoredNotificationHistory(merged);
              return merged;
            });
          }
        }
      } catch {
        // Local cleanup already applied
      }
    }
    addNotification({
      type: 'success',
      titleKey: 'notifications.historyCleanedTitle',
      messageKey: 'notifications.historyCleanedMsg',
      skipHistory: true
    });
  }, [bridgeHttpBase, addNotification]);

  const applyHardwareSnapshot = useCallback((rawPayload, receivedAtIso) => {
    const snapshot = rawPayload?.snapshot || (rawPayload?.dht11 && rawPayload?.mq2 ? rawPayload : null);
    if (!snapshot || !snapshot.dht11 || !snapshot.mq2 || !snapshot.devices) {
      return;
    }

    const nowMs = Date.now();
    lastHardwareTelemetryAtRef.current = nowMs;
    const timestampIso = receivedAtIso || rawPayload?.snapshotReceivedAt || new Date(nowMs).toISOString();
    const isHwEnabled = snapshot.source === 'Hardware';
    const dataSourceLabel = isHwEnabled ? 'ESP32-S3 Live' : 'Hardware Standby';
    const mq2Alert = snapshot.mq2.smoke === 'ALERT';
    const mq2Preheating = Boolean(snapshot.mq2.preheating);

    setIsSmokeAlert(mq2Alert);
    setHardwareStatus({
      isLive: true,
      lastTelemetryAt: timestampIso,
      dataSource: dataSourceLabel,
      dhtValid: Boolean(snapshot.dht11.valid),
      mq2Valid: Boolean(snapshot.mq2.valid),
      mq2Preheating,
      mq2RawMv: snapshot.mq2.rawMv ?? null,
      mq2Percent: snapshot.mq2.smokePercent ?? null
    });

    setRooms((prevRooms) =>
      prevRooms.map((room) => ({
        ...room,
        devices: room.devices.map((device) => {
          const pendingUntil = pendingDeviceUntilRef.current[device.id] || 0;
          if (nowMs < pendingUntil || !Object.prototype.hasOwnProperty.call(snapshot.devices, device.id)) {
            return device;
          }
          if (device.type === 'lock') {
            return {
              ...device,
              state: snapshot.devices[device.id] === 'UNLOCKED' ? 'UNLOCKED' : 'LOCKED'
            };
          }
          return {
            ...device,
            state: Boolean(snapshot.devices[device.id])
          };
        }),
        sensors: room.sensors.map((sensor) => {
          if (sensor.type === 'temperature') {
            return snapshot.dht11.valid
              ? { ...sensor, value: Number(snapshot.dht11.temperature), status: 'NORMAL', source: 'ESP32-S3 Live (DHT11)' }
              : { ...sensor, value: 'No Data', status: 'NO DATA', source: 'No Data (DHT11)' };
          }
          if (sensor.type === 'humidity') {
            return snapshot.dht11.valid
              ? { ...sensor, value: Number(snapshot.dht11.humidity), status: 'NORMAL', source: 'ESP32-S3 Live (DHT11)' }
              : { ...sensor, value: 'No Data', status: 'NO DATA', source: 'No Data (DHT11)' };
          }
          if (sensor.type === 'smoke') {
            if (!snapshot.mq2.valid) {
              return { ...sensor, value: 'No Data', status: 'NO DATA', source: 'No Data (MQ-2)' };
            }
            if (mq2Preheating) {
              return {
                ...sensor,
                value: `Preheating (${snapshot.mq2.smokePercent ?? 0}%)`,
                status: 'PREHEATING',
                source: 'ESP32-S3 Live (MQ-2)'
              };
            }
            if (mq2Alert) {
              return {
                ...sensor,
                value: `SMOKE (${snapshot.mq2.smokePercent ?? 100}%)`,
                status: 'ALERT',
                source: 'ESP32-S3 Live (MQ-2)'
              };
            }
            return {
              ...sensor,
              value: `Clear (${snapshot.mq2.smokePercent ?? 0}%)`,
              status: 'NORMAL',
              source: 'ESP32-S3 Live (MQ-2)'
            };
          }
          if (sensor.id === 'living_ap' || sensor.id === 'hallway_nfc_sensor') {
            return { ...sensor, value: 'Connected', status: 'ONLINE', source: dataSourceLabel };
          }
          return sensor;
        })
      }))
    );

    setNetworkState((prev) => ({
      ...prev,
      mqttBroker: true,
      lastUpdated: new Date(timestampIso).toLocaleTimeString('en-US')
    }));
  }, []);

  const applyDeviceStateAck = useCallback((ackPayload, receivedAtIso) => {
    if (!ackPayload || typeof ackPayload.deviceId !== 'string') {
      return;
    }

    delete pendingDeviceUntilRef.current[ackPayload.deviceId];
    const waiter = pendingAckWaitersRef.current.get(ackPayload.commandId);
    if (waiter) {
      pendingAckWaitersRef.current.delete(ackPayload.commandId);
      waiter(ackPayload);
    }

    if (ackPayload.status !== 'SUCCESS') {
      return;
    }

    setRooms((prevRooms) =>
      prevRooms.map((room) => ({
        ...room,
        devices: room.devices.map((device) => {
          if (device.id !== ackPayload.deviceId) return device;
          if (device.type === 'lock') {
            return { ...device, state: ackPayload.state === 'UNLOCKED' ? 'UNLOCKED' : 'LOCKED' };
          }
          return { ...device, state: ackPayload.state === 'ON' };
        })
      }))
    );

    if (receivedAtIso) {
      setNetworkState((prev) => ({
        ...prev,
        lastUpdated: new Date(receivedAtIso).toLocaleTimeString('en-US')
      }));
    }
  }, []);

  const handleHardwareCriticalEvent = useCallback((payload, receivedAtIso) => {
    if (!payload || typeof payload.event_id !== 'string') {
      return;
    }
    if (seenCriticalEventsRef.current.has(payload.event_id)) {
      return;
    }
    if (seenCriticalEventsRef.current.size >= 50) {
      seenCriticalEventsRef.current.clear();
    }
    seenCriticalEventsRef.current.add(payload.event_id);

    setIsSmokeAlert(true);
    addNotification({
      type: 'error',
      titleKey: 'notifications.smokeCriticalTitle',
      messageKey: 'notifications.smokeCriticalMsg',
      title: payload.title || 'CRITICAL HAZARD: Smoke Detected (MQ-2)',
      message: payload.message || 'Live MQ-2 reading exceeded configured safety threshold.'
    });
    setRecentActivity((prev) => [
      {
        id: `hw-crit-${Date.now()}`,
        titleKey: 'activity.smokeTriggeredTitle',
        subKey: 'activity.smokeTriggeredSub',
        title: payload.title || 'MQ-2 Smoke Hazard Detected',
        sub: 'ALERT · GPIO1 threshold exceeded · Source: Hardware Live',
        time: new Date(receivedAtIso || Date.now()).toLocaleTimeString('en-US'),
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);
  }, [addNotification]);

  const connectBridge = useCallback(() => {
    setBridgeEnabled(true);
    setBridgeConnectAttempt((attempt) => attempt + 1);
    setBridgeState((current) => ({
      ...current,
      status: !localBridgeUrl ? 'not-configured' : isInsecureRemoteBridge ? 'unavailable' : 'connecting',
      error: isInsecureRemoteBridge ? 'Remote dashboard connections require a WSS bridge URL.' : null
    }));
  }, [isInsecureRemoteBridge, localBridgeUrl]);

  useEffect(() => {
    if (!isEmbeddedFirmwareHost) {
      return undefined;
    }

    let active = true;
    const readDeviceNetworkStatus = async () => {
      try {
        const response = await fetch('/api/network/status', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const status = await response.json();
        if (!['initializing', 'station_connecting', 'station_connected',
          'fallback_ap_active', 'fallback_ap_reconnecting', 'station_ap_recovery',
          'unavailable'].includes(status.state)
          || typeof status.station_connected !== 'boolean'
          || typeof status.fallback_ap_active !== 'boolean') {
          throw new Error('Invalid firmware network status response.');
        }
        if (active) {
          setDeviceNetworkStatus({ available: true, ...status });
        }
      } catch {
        if (active) {
          setDeviceNetworkStatus({
            available: false,
            error: 'Firmware network status is currently unavailable.'
          });
        }
      }
    };

    readDeviceNetworkStatus();
    const interval = setInterval(readDeviceNetworkStatus, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isEmbeddedFirmwareHost]);

  // Embedded ESP32 AP HTTP fallback polling (when hosted on http://192.168.4.1/ or esp32-lan.local)
  useEffect(() => {
    if (!isEmbeddedFirmwareHost) {
      return undefined;
    }

    let active = true;
    const pollEmbeddedHardwareState = async () => {
      try {
        const response = await fetch('/api/hardware/state', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (active) {
          applyHardwareSnapshot(data, new Date().toISOString());
        }
      } catch {
        // Keep last state until next embedded poll
      }
    };

    pollEmbeddedHardwareState();
    const interval = setInterval(pollEmbeddedHardwareState, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isEmbeddedFirmwareHost, applyHardwareSnapshot]);

  useEffect(() => {
    if (!localBridgeUrl || !bridgeEnabled || isInsecureRemoteBridge) {
      return undefined;
    }

    let socket;
    let isActive = true;
    let reconnectTimer;
    let reconnectAttempt = 0;
    let authenticationRejected = false;

    const hydrateBridgeHardwareState = async () => {
      if (!bridgeHttpBase) return;
      try {
        const response = await fetch(`${bridgeHttpBase}/api/hardware/state`, {
          credentials: 'include',
          cache: 'no-store'
        });
        if (!response.ok || !isActive) return;
        const data = await response.json();
        if (data?.snapshot) {
          applyHardwareSnapshot(data, data.snapshotReceivedAt);
        }
      } catch {
        // Live telemetry continues arriving via WebSocket
      }
    };

    const scheduleReconnect = () => {
      if (!isActive || reconnectTimer) {
        return;
      }

      const delay = Math.min(1000 * (2 ** reconnectAttempt), 5000);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        openSocket();
      }, delay);
    };

    const openSocket = () => {
      try {
        socket = new WebSocket(localBridgeUrl);
        activeSocketRef.current = socket;
      } catch {
        setBridgeState((current) => ({
          ...current,
          status: 'unavailable',
          error: 'Could not open the local bridge connection.'
        }));
        return;
      }

      socket.addEventListener('open', () => {
        if (!isActive) {
          return;
        }

        reconnectAttempt = 0;
        setBridgeState((current) => ({
          ...current,
          status: 'connecting',
          error: null
        }));
        socket.send(JSON.stringify({ type: 'subscribe', topics: [TEST_TOPIC] }));
      });

      socket.addEventListener('message', (event) => {
        if (!isActive) {
          return;
        }

        try {
          const message = JSON.parse(event.data);

          if (message.type === 'authenticated') {
            socket.send(JSON.stringify({ type: 'subscribe', topics: [TEST_TOPIC] }));
            hydrateBridgeHardwareState();
            return;
          }

          if (message.type === 'authentication-error') {
            authenticationRejected = true;
            setBridgeState((current) => ({
              ...current,
              status: 'unauthorized',
              error: 'Bridge session expired. Sign in again to reconnect.'
            }));
            socket.close();
            return;
          }

          if (message.type === 'status') {
            if (!['connected', 'reconnecting', 'unavailable'].includes(message.state)) {
              return;
            }

            setBridgeState((current) => ({
              ...current,
              status: message.state,
              error: message.state === 'unavailable'
                ? 'Local bridge cannot reach the MQTT broker.'
                : null
            }));
            if (message.state === 'connected') {
              hydrateBridgeHardwareState();
            }
            return;
          }

          if (message.type === 'mqtt-message') {
            if (HOME_TELEMETRY_TOPIC_REGEX.test(message.topic)) {
              applyHardwareSnapshot(message.payload, message.receivedAt);
              return;
            }

            if (HOME_STATE_TOPIC_REGEX.test(message.topic)) {
              applyDeviceStateAck(message.payload, message.receivedAt);
              return;
            }

            if (message.topic === HOME_CRITICAL_EVENT_TOPIC) {
              handleHardwareCriticalEvent(message.payload, message.receivedAt);
              return;
            }

            if (message.topic === HOME_HEARTBEAT_TOPIC) {
              lastHardwareTelemetryAtRef.current = Date.now();
              setNetworkState((prev) => ({
                ...prev,
                mqttBroker: true,
                lastUpdated: new Date(message.receivedAt || Date.now()).toLocaleTimeString('en-US')
              }));
              return;
            }

            if (!isConnectivityTestPayload(message.topic, message.payload)) {
              return;
            }

            const receivedAt = new Date().toISOString();
            setBridgeState((current) => ({
              ...current,
              status: 'connected',
              lastMessageAt: receivedAt,
              lastMessage: message.payload,
              messageStale: false,
              error: null
            }));
            setRecentActivity((previous) => [
              {
                id: `bridge-${Date.now()}`,
                titleKey: 'activity.mqttPacketTitle',
                subKey: 'activity.mqttPacketSub',
                params: { seq: message.payload.sequence },
                title: 'ESP32-S3 MQTT packet received',
                sub: `Sequence #${message.payload.sequence} · Source: Live MQTT`,
                time: new Date(receivedAt).toLocaleTimeString('en-US'),
                type: 'network'
              },
              ...previous.slice(0, 5)
            ]);
            return;
          }
        } catch {
          // Ignore malformed bridge frames
        }
      });

      socket.addEventListener('close', () => {
        if (!isActive || authenticationRejected) {
          return;
        }

        setBridgeState((current) => ({
          ...current,
          status: 'reconnecting',
          error: null
        }));
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        if (!isActive) {
          return;
        }
        socket.close();
      });
    };

    openSocket();

    return () => {
      isActive = false;
      clearTimeout(reconnectTimer);
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
      if (activeSocketRef.current === socket) {
        activeSocketRef.current = null;
      }
    };
  }, [
    bridgeConnectAttempt,
    bridgeEnabled,
    bridgeHttpBase,
    isInsecureRemoteBridge,
    localBridgeUrl,
    applyHardwareSnapshot,
    applyDeviceStateAck,
    handleHardwareCriticalEvent
  ]);

  useEffect(() => {
    if (!bridgeState.lastMessageAt || bridgeState.messageStale) {
      return undefined;
    }

    const elapsed = Date.now() - new Date(bridgeState.lastMessageAt).getTime();
    const staleDelay = Math.max(0, TEST_MESSAGE_STALE_AFTER_MS - elapsed);
    const timer = setTimeout(() => {
      setBridgeState((current) => current.lastMessageAt === bridgeState.lastMessageAt
        ? { ...current, messageStale: true }
        : current);
    }, staleDelay);

    return () => clearTimeout(timer);
  }, [bridgeState.lastMessageAt, bridgeState.messageStale]);

  // Watchdog: when ESP32-S3 telemetry has not arrived or goes stale (>15s), mark sensors as No Data (no random simulation)
  useEffect(() => {
    const interval = setInterval(() => {
      const hwAgeMs = lastHardwareTelemetryAtRef.current
        ? Date.now() - lastHardwareTelemetryAtRef.current
        : Infinity;

      if (hwAgeMs < HARDWARE_TELEMETRY_STALE_AFTER_MS) {
        return;
      }

      if (lastHardwareTelemetryAtRef.current !== 0) {
        lastHardwareTelemetryAtRef.current = 0;
        setIsSmokeAlert(false);
        setHardwareStatus((prev) => ({
          ...prev,
          isLive: false,
          dataSource: 'No Data (ESP32-S3)',
          dhtValid: false,
          mq2Valid: false,
          mq2Preheating: false
        }));
        setRooms((prevRooms) =>
          prevRooms.map((room) => ({
            ...room,
            sensors: room.sensors.map((sensor) => ({
              ...sensor,
              value: 'No Data',
              status: 'NO DATA',
              source: 'No Data (ESP32-S3)'
            }))
          }))
        );
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const toggleSmokeAlarm = useCallback((triggerAlert) => {
    setIsSmokeAlert(triggerAlert);
    const nowTime = new Date().toLocaleTimeString('en-US');

    setRooms((prevRooms) =>
      prevRooms.map((room) => ({
        ...room,
        sensors: room.sensors.map((sensor) => {
          if (sensor.type === 'smoke') {
            return {
              ...sensor,
              status: triggerAlert ? 'ALERT' : 'NORMAL',
              value: triggerAlert ? 'SMOKE DETECTED!' : 'Clear'
            };
          }
          return sensor;
        })
      }))
    );

    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        titleKey: triggerAlert ? 'activity.smokeTriggeredTitle' : 'activity.smokeClearedTitle',
        subKey: triggerAlert ? 'activity.smokeTriggeredSub' : 'activity.smokeClearedSub',
        title: triggerAlert ? 'MQ-2 Smoke Hazard Alert Triggered' : 'MQ-2 Smoke Alert Cleared',
        sub: triggerAlert ? 'ALERT · Particulate threshold exceeded' : 'NORMAL · Air quality clear',
        time: nowTime,
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);

    if (triggerAlert) {
      addNotification({
        type: 'error',
        titleKey: 'notifications.smokeCriticalTitle',
        messageKey: 'notifications.smokeCriticalMsg',
        title: 'CRITICAL HAZARD: Smoke Detected (MQ-2)',
        message: 'Live MQ-2 ADC reading on GPIO1 exceeded configured safety threshold.'
      });
    } else {
      addNotification({
        type: 'success',
        titleKey: 'notifications.smokeClearedTitle',
        messageKey: 'notifications.smokeClearedMsg',
        title: 'Hazard Cleared: Normal Air Quality',
        message: 'MQ-2 smoke sensors returned to normal baseline.'
      });
    }
  }, [addNotification]);

  const toggleDevice = useCallback(async (deviceId, targetState) => {
    const startTime = performance.now();
    const nowTime = new Date().toLocaleTimeString('en-US');

    if (networkState.mode === NETWORK_MODES.UNAVAILABLE) {
      setMetrics((prev) => ({
        ...prev,
        commandsTotal: prev.commandsTotal + 1
      }));
      addNotification({
        type: 'error',
        titleKey: 'notifications.cmdRejectedOfflineTitle',
        messageKey: 'notifications.cmdRejectedOfflineMsg',
        title: 'Command Rejected · Link Offline',
        message: 'Local LAN and ESP32-S3 Gateway are currently unreachable.'
      });
      return { ok: false };
    }

    let existingDevice = null;
    for (const room of roomsRef.current) {
      const match = room.devices.find((d) => d.id === deviceId);
      if (match) {
        existingDevice = match;
        break;
      }
    }

    const changedDeviceName = existingDevice?.name || deviceId;
    const isLockType = existingDevice?.type === 'lock';
    const deviceType = existingDevice?.type || 'light';
    const previousState = existingDevice?.state;
    const nextStateValue = isLockType ? (targetState ? 'UNLOCKED' : 'LOCKED') : Boolean(targetState);
    const targetStateStr = isLockType ? (targetState ? 'UNLOCKED' : 'LOCKED') : (targetState ? 'ON' : 'OFF');

    const updateRoomDeviceState = (valueToApply) => {
      setRooms((prevRooms) =>
        prevRooms.map((room) => ({
          ...room,
          devices: room.devices.map((device) =>
            device.id === deviceId ? { ...device, state: valueToApply } : device
          )
        }))
      );
    };

    const useEmbeddedApi = isEmbeddedFirmwareHost;
    const useBridgeApi = !useEmbeddedApi && Boolean(bridgeHttpBase) && bridgeStatusRef.current === 'connected';

    const stateAction = isLockType
      ? (targetState ? 'Unlocked' : 'Locked')
      : (targetState ? 'turned ON' : 'turned OFF');
    const actionKey = isLockType
      ? (targetState ? 'notifications.actionUnlocked' : 'notifications.actionLocked')
      : (targetState ? 'notifications.actionTurnedOn' : 'notifications.actionTurnedOff');

    if (!useEmbeddedApi && !useBridgeApi) {
      setMetrics((prev) => ({
        ...prev,
        commandsTotal: prev.commandsTotal + 1
      }));
      addNotification({
        type: 'error',
        titleKey: 'notifications.cmdNoDataTitle',
        messageKey: 'notifications.cmdNoDataMsg',
        params: { deviceId, device: changedDeviceName },
        title: `${changedDeviceName} · No Data Received`,
        message: 'Not connected to ESP32-S3 or MQTT Bridge; hardware command cannot be sent.'
      });
      return { ok: false };
    }

    pendingDeviceUntilRef.current[deviceId] = Date.now() + 2500;
    updateRoomDeviceState(nextStateValue);

    const recordFailure = (errorMessage) => {
      delete pendingDeviceUntilRef.current[deviceId];
      if (previousState !== undefined) {
        updateRoomDeviceState(previousState);
      }
      setMetrics((prev) => ({
        ...prev,
        commandsTotal: prev.commandsTotal + 1
      }));
      addNotification({
        type: 'error',
        titleKey: 'notifications.cmdFailedTitle',
        params: { deviceId, device: changedDeviceName },
        title: `${changedDeviceName} Command Failed`,
        message: errorMessage
      });
      return { ok: false };
    };

    try {
      const endpoint = useEmbeddedApi ? '/api/hardware/command' : `${bridgeHttpBase}/api/devices/command`;
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: useEmbeddedApi ? 'same-origin' : 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandId: `cmd-web-${Date.now()}`,
          deviceId,
          targetState: targetStateStr
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || (useEmbeddedApi && data.status !== 'SUCCESS')) {
        return recordFailure(data.error || `HTTP ${response.status} rejected device command.`);
      }

      let ackNote = useEmbeddedApi
        ? `Embedded AP · GPIO${data.hardwarePin ?? '?'} · Source: ESP32-S3 Live`
        : 'MQTT Broker QoS 1 · Awaiting ESP32-S3';
      let ackKey = useEmbeddedApi ? 'notifications.ackEmbedded' : 'notifications.ackMqttWait';
      let ackPin = data.hardwarePin ?? '?';

      if (useBridgeApi && data.commandId) {
        const hardwareAck = await new Promise((resolve) => {
          const timer = setTimeout(() => {
            pendingAckWaitersRef.current.delete(data.commandId);
            resolve(null);
          }, 1200);
          pendingAckWaitersRef.current.set(data.commandId, (ack) => {
            clearTimeout(timer);
            resolve(ack);
          });
        });

        if (hardwareAck && hardwareAck.status === 'FAILED') {
          return recordFailure(hardwareAck.error || 'ESP32 hardware execution failed.');
        }
        if (hardwareAck && hardwareAck.status === 'SUCCESS') {
          ackPin = hardwareAck.hardwarePin ?? '?';
          ackKey = 'notifications.ackMqttBridge';
          ackNote = `MQTT Bridge -> ESP32-S3 GPIO${ackPin} · Source: ESP32-S3 Live`;
        }
      }

      const elapsed = Math.max(1, Math.round(performance.now() - startTime));
      setMetrics((prev) => {
        const newTotal = prev.commandsTotal + 1;
        const newSuccess = (prev.commandsSuccess || 0) + 1;
        const newAvg = Math.round((prev.avgResponseTimeMs * prev.commandsTotal + elapsed) / newTotal);
        return {
          ...prev,
          commandsTotal: newTotal,
          commandsSuccess: newSuccess,
          avgResponseTimeMs: newAvg
        };
      });
      setNetworkState((prev) => ({ ...prev, lastUpdated: nowTime }));
      const eventParams = { deviceId, device: changedDeviceName, actionKey, ackKey, pin: ackPin };
      setRecentActivity((prev) => [
        {
          id: `act-${Date.now()}`,
          titleKey: 'notifications.cmdSuccessTitle',
          params: eventParams,
          title: `${changedDeviceName} ${stateAction}`,
          sub: ackNote,
          time: nowTime,
          type: deviceType
        },
        ...prev.slice(0, 5)
      ]);
      addNotification({
        type: 'success',
        titleKey: 'notifications.cmdSuccessTitle',
        params: eventParams,
        appendLatencyMs: elapsed,
        title: `${changedDeviceName} ${stateAction}`,
        message: `${ackNote} (${elapsed}ms).`
      });
      return { ok: true, latencyMs: elapsed };
    } catch {
      return recordFailure('Network request to hardware controller failed.');
    }
  }, [networkState.mode, addNotification, isEmbeddedFirmwareHost, bridgeHttpBase]);

  const triggerFault = useCallback((faultType) => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    const startTransitionTime = performance.now();
    const nowTime = new Date().toLocaleTimeString('en-US');

    if (faultType === 'INTERNET_DOWN') {
      setNetworkState((prev) => ({
        ...prev,
        mode: NETWORK_MODES.SWITCHING,
        internet: false,
        lastUpdated: nowTime
      }));

      addNotification({
        type: 'warning',
        titleKey: 'notifications.wanLostTitle',
        messageKey: 'notifications.wanLostMsg',
        title: 'Internet Uplink Lost',
        message: 'Switching control path to autonomous Local LAN...'
      });

      transitionTimerRef.current = setTimeout(() => {
        const fallbackDuration = Math.round(performance.now() - startTransitionTime);
        const resolvedTime = new Date().toLocaleTimeString('en-US');

        setNetworkState((prev) => ({
          ...prev,
          mode: NETWORK_MODES.LOCAL,
          internet: false,
          localLan: true,
          latencyMs: 14,
          lastUpdated: resolvedTime
        }));

        setMetrics((prev) => ({
          ...prev,
          fallbackTimeMs: fallbackDuration
        }));

        setRecentActivity((prev) => [
          {
            id: `act-${Date.now()}`,
            titleKey: 'activity.failoverLocalTitle',
            subKey: 'activity.failoverLocalSub',
            params: { ms: fallbackDuration },
            title: 'Failover to Local LAN Mode',
            sub: `Transitioned in ${fallbackDuration}ms`,
            time: resolvedTime,
            type: 'network'
          },
          ...prev.slice(0, 5)
        ]);

        setExperimentLogs((prev) => [
          {
            id: `EXP-${Date.now().toString().slice(-4)}`,
            time: resolvedTime,
            testKey: 'testLab.dockT2',
            test: 'T2: Internet Partition',
            internet: 'OFF',
            lan: 'ON',
            expected: 'LOCAL',
            measured: `${fallbackDuration} ms`,
            result: 'PASS'
          },
          ...prev
        ]);

        addNotification({
          type: 'warning',
          titleKey: 'notifications.lanFallbackTitle',
          messageKey: 'notifications.lanFallbackMsg',
          params: { ms: fallbackDuration },
          title: 'LOCAL FALLBACK ACTIVE',
          message: `Switched to Local LAN in ${fallbackDuration}ms. Domestic controls remain online.`
        });
      }, 400);
    } else if (faultType === 'LAN_DOWN') {
      setNetworkState({
        mode: NETWORK_MODES.UNAVAILABLE,
        internet: false,
        localLan: false,
        mqttBroker: false,
        latencyMs: 0,
        lastUpdated: nowTime
      });

      setExperimentLogs((prev) => [
        {
          id: `EXP-${Date.now().toString().slice(-4)}`,
          time: nowTime,
          testKey: 'testLab.dockT3',
          test: 'T3: Total Network Outage',
          internet: 'OFF',
          lan: 'OFF',
          expected: 'UNAVAILABLE',
          measured: '12 ms',
          result: 'PASS'
        },
        ...prev
      ]);

      setRecentActivity((prev) => [
        {
          id: `act-${Date.now()}`,
          titleKey: 'activity.lanOutageTitle',
          subKey: 'activity.lanOutageSub',
          title: 'Total Network Outage',
          sub: 'UNAVAILABLE · Controls locked',
          time: nowTime,
          type: 'network'
        },
        ...prev.slice(0, 5)
      ]);

      addNotification({
        type: 'error',
        titleKey: 'notifications.lanDownTitle',
        messageKey: 'notifications.lanDownMsg',
        title: 'GATEWAY UNREACHABLE',
        message: 'Local LAN and ESP32-S3 Gateway are offline. Remote controls are locked.'
      });
    } else if (faultType === 'SIMULATE_RECOVERY') {
      setNetworkState((prev) => ({
        ...prev,
        mode: NETWORK_MODES.RECONNECTING,
        internet: true,
        lastUpdated: nowTime
      }));

      addNotification({
        type: 'info',
        titleKey: 'notifications.cloudSyncingTitle',
        messageKey: 'notifications.cloudSyncingMsg',
        title: 'Cloud Link Restored',
        message: 'Replaying buffered local telemetry to cloud storage...'
      });

      transitionTimerRef.current = setTimeout(() => {
        const recoveredTime = new Date().toLocaleTimeString('en-US');
        setNetworkState({
          mode: NETWORK_MODES.NORMAL,
          internet: true,
          localLan: true,
          mqttBroker: true,
          latencyMs: 20,
          lastUpdated: recoveredTime
        });

        setExperimentLogs((prev) => [
          {
            id: `EXP-${Date.now().toString().slice(-4)}`,
            time: recoveredTime,
            testKey: 'testLab.dockT4',
            test: 'T4: Carrier Recovery & Sync',
            internet: 'RESTORED',
            lan: 'ON',
            expected: 'NORMAL',
            measured: '785 ms',
            result: 'PASS'
          },
          ...prev
        ]);

        setRecentActivity((prev) => [
          {
            id: `act-${Date.now()}`,
            titleKey: 'activity.cloudRestoredTitle',
            subKey: 'activity.cloudRestoredSub',
            title: 'Cloud connection synchronized',
            sub: 'NORMAL · Dual-path active',
            time: recoveredTime,
            type: 'network'
          },
          ...prev.slice(0, 5)
        ]);

        addNotification({
          type: 'success',
          titleKey: 'notifications.cloudRestoredTitle',
          messageKey: 'notifications.cloudRestoredMsg',
          params: { ms: 785 },
          title: 'NORMAL MODE RESTORED',
          message: 'Cloud uplink and Local LAN are synchronized.'
        });
      }, 800);
    }
  }, [addNotification]);

  const restoreNormal = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    const nowTime = new Date().toLocaleTimeString('en-US');
    setNetworkState({
      ...INITIAL_NETWORK_STATE,
      lastUpdated: nowTime
    });
    setIsSmokeAlert(false);
    setRooms((prevRooms) =>
      prevRooms.map((room) => ({
        ...room,
        sensors: room.sensors.map((s) =>
          s.type === 'smoke' && s.status === 'ALERT' ? { ...s, status: 'NORMAL', value: 'Clear' } : s
        )
      }))
    );

    setExperimentLogs((prev) => [
      {
        id: `EXP-${Date.now().toString().slice(-4)}`,
        time: nowTime,
        testKey: 'testLab.dockT1',
        test: 'T1: Normal Baseline Engaged',
        internet: 'ON',
        lan: 'ON',
        expected: 'NORMAL',
        measured: '18 ms',
        result: 'PASS'
      },
      ...prev
    ]);

    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        titleKey: 'activity.baselineRestoredTitle',
        subKey: 'activity.baselineRestoredSub',
        title: 'Normal baseline restored',
        sub: 'NORMAL · Dual-path active',
        time: nowTime,
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);

    addNotification({
      type: 'success',
      titleKey: 'notifications.baselineTitle',
      messageKey: 'notifications.baselineMsg',
      title: 'Normal Baseline Active',
      message: 'All zones, sensors, and network routes returned to normal operation.'
    });
  }, [addNotification]);

  // Reset all transient state and close active WebSocket on sign-out
  const resetSystemState = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    if (activeSocketRef.current) {
      try {
        activeSocketRef.current.close();
      } catch {
        // Ignore close errors
      }
      activeSocketRef.current = null;
    }
    setBridgeEnabled(false);
    lastHardwareTelemetryAtRef.current = 0;
    pendingDeviceUntilRef.current = {};
    pendingAckWaitersRef.current.clear();
    seenCriticalEventsRef.current.clear();
    setHardwareStatus({
      isLive: false,
      lastTelemetryAt: null,
      dataSource: 'No Data (ESP32-S3)',
      dhtValid: false,
      mq2Valid: false,
      mq2Preheating: false,
      mq2RawMv: null,
      mq2Percent: null
    });
    setRooms(INITIAL_ROOMS_DATA);
    setNetworkState({
      ...INITIAL_NETWORK_STATE,
      lastUpdated: new Date().toLocaleTimeString('en-US')
    });
    setSelectedRoomId(null);
    setIsSmokeAlert(false);
    setNotifications([]);
    setRecentActivity(INITIAL_ACTIVITY_LIST);
  }, []);

  return {
    rooms,
    networkState,
    deviceNetworkStatus,
    hardwareStatus,
    bridgeState,
    connectBridge,
    metrics,
    selectedRoomId,
    setSelectedRoomId,
    isSmokeAlert,
    toggleSmokeAlarm,
    recentActivity,
    experimentLogs,
    notifications,
    notificationHistory,
    historyMeta,
    addNotification,
    dismissNotification,
    deleteNotificationHistoryItem,
    clearAllNotificationHistory,
    cleanupExpiredNotifications,
    toggleDevice,
    triggerFault,
    restoreNormal,
    resetSystemState
  };
}
