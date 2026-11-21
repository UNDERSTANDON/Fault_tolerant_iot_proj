import { useState, useCallback, useRef, useEffect } from 'react';
import { INITIAL_ROOMS_DATA, INITIAL_NETWORK_STATE, NETWORK_MODES } from '../data/initialMockData';

const TEST_TOPIC = 'demo/esp32-mqtt-connectivity/test';
const TEST_MESSAGE_STALE_AFTER_MS = 70000;

const INITIAL_ACTIVITY_LIST = [
  {
    id: 'act-1',
    title: 'Living Room Ceiling Light turned ON',
    sub: 'Local LAN ACK · Relay CH2 · Source: Simulator',
    time: '10:23:42',
    type: 'light'
  },
  {
    id: 'act-2',
    title: 'Living Room Ventilation Fan turned OFF',
    sub: 'Local LAN ACK · Relay CH3 · Source: Simulator',
    time: '10:23:10',
    type: 'fan'
  },
  {
    id: 'act-3',
    title: 'Local gateway link verified',
    sub: 'NORMAL · All 4 zones online · Source: Simulator',
    time: '10:22:05',
    type: 'network'
  }
];

const INITIAL_EXPERIMENT_LOGS = [
  { id: 'EXP-101', time: '10:20:10', test: 'T1: Normal Baseline', internet: 'ON', lan: 'ON', expected: 'NORMAL', measured: '18 ms', result: 'PASS · Simulator' },
  { id: 'EXP-102', time: '10:21:40', test: 'T2: Internet Partition', internet: 'OFF', lan: 'ON', expected: 'LOCAL', measured: '320 ms', result: 'PASS · Simulator' },
  { id: 'EXP-103', time: '10:22:05', test: 'T3: LAN Router Failure', internet: 'OFF', lan: 'OFF', expected: 'UNAVAILABLE', measured: '12 ms', result: 'PASS · Simulator' },
  { id: 'EXP-104', time: '10:23:15', test: 'T4: Carrier Recovery', internet: 'RESTORED', lan: 'ON', expected: 'NORMAL', measured: '780 ms', result: 'PASS · Simulator' }
];

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
  const bridgeSecurity = getBridgeSecurityMode(localBridgeUrl);
  const isInsecureRemoteBridge = Boolean(localBridgeUrl && bridgeSecurity.isRemote && !bridgeSecurity.usesTls);
  const [rooms, setRooms] = useState(INITIAL_ROOMS_DATA);
  const [networkState, setNetworkState] = useState(INITIAL_NETWORK_STATE);
  const [recentActivity, setRecentActivity] = useState(INITIAL_ACTIVITY_LIST);
  const [experimentLogs, setExperimentLogs] = useState(INITIAL_EXPERIMENT_LOGS);
  const [notifications, setNotifications] = useState([]);
  const [metrics, setMetrics] = useState({
    fallbackTimeMs: 0,
    avgResponseTimeMs: 24,
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
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [isSmokeAlert, setIsSmokeAlert] = useState(false);

  const activeSocketRef = useRef(null);
  const transitionTimerRef = useRef(null);

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
    if (!localBridgeUrl || !bridgeEnabled || isInsecureRemoteBridge) {
      return undefined;
    }

    let socket;
    let isActive = true;
    let reconnectTimer;
    let reconnectAttempt = 0;
    let authenticationRejected = false;

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
            return;
          }

          if (message.type === 'mqtt-message') {
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
  }, [bridgeConnectAttempt, bridgeEnabled, isInsecureRemoteBridge, localBridgeUrl]);

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

  // Live natural sensor drift when network is NOT UNAVAILABLE
  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkState((currentNet) => {
        if (currentNet.mode === NETWORK_MODES.UNAVAILABLE) {
          return currentNet;
        }

        setRooms((prevRooms) =>
          prevRooms.map((room) => ({
            ...room,
            sensors: room.sensors.map((sensor) => {
              if (sensor.type === 'temperature') {
                const delta = Math.random() * 0.4 - 0.2;
                const newTemp = Math.round((sensor.value + delta) * 10) / 10;
                const clamped = Math.min(31.0, Math.max(25.5, newTemp));
                return { ...sensor, value: clamped };
              }
              if (sensor.type === 'humidity') {
                const delta = Math.floor(Math.random() * 3) - 1;
                const clamped = Math.min(72, Math.max(58, sensor.value + delta));
                return { ...sensor, value: clamped };
              }
              return sensor;
            })
          }))
        );

        return currentNet;
      });
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addNotification = useCallback(({ type = 'info', title, message }) => {
    const newId = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast = {
      id: newId,
      type,
      title,
      message,
      time: new Date().toLocaleTimeString('en-US')
    };

    setNotifications((prev) => [newToast, ...prev].slice(0, 4));

    setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== newId));
    }, 4500);
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
        title: triggerAlert ? 'MQ-2 Smoke Hazard Alert Triggered' : 'MQ-2 Smoke Alert Cleared',
        sub: triggerAlert ? 'ALERT · Particulate threshold exceeded · Source: Simulator' : 'NORMAL · Air quality clear · Source: Simulator',
        time: nowTime,
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);

    if (triggerAlert) {
      addNotification({
        type: 'error',
        title: 'CRITICAL HAZARD: Smoke Detected (MQ-2)',
        message: 'Particulate threshold exceeded in monitored zones. Local safety alert engaged (Source: Simulator).'
      });
    } else {
      addNotification({
        type: 'success',
        title: 'Hazard Cleared: Normal Air Quality',
        message: 'MQ-2 smoke sensors returned to normal baseline.'
      });
    }
  }, [addNotification]);

  const toggleDevice = useCallback((deviceId, targetState) => {
    const startTime = performance.now();
    const nowTime = new Date().toLocaleTimeString('en-US');

    if (networkState.mode === NETWORK_MODES.UNAVAILABLE) {
      setMetrics((prev) => ({
        ...prev,
        commandsTotal: prev.commandsTotal + 1
      }));
      addNotification({
        type: 'error',
        title: 'Command Rejected · Link Offline',
        message: 'Local LAN and ESP32-S3 Gateway are currently unreachable.'
      });
      return false;
    }

    let changedDeviceName = '';
    let isLockType = false;
    let deviceType = 'light';

    setRooms((prevRooms) =>
      prevRooms.map((room) => ({
        ...room,
        devices: room.devices.map((device) => {
          if (device.id === deviceId) {
            changedDeviceName = device.name;
            isLockType = device.type === 'lock';
            deviceType = device.type;
            return {
              ...device,
              state: isLockType ? (targetState ? 'UNLOCKED' : 'LOCKED') : targetState
            };
          }
          return device;
        })
      }))
    );

    const elapsed = Math.round(performance.now() - startTime + (networkState.mode === 'LOCAL' ? 12 : 22));

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

    setNetworkState((prev) => ({
      ...prev,
      lastUpdated: nowTime
    }));

    const stateAction = isLockType
      ? (targetState ? 'Unlocked' : 'Locked')
      : (targetState ? 'turned ON' : 'turned OFF');
    const routeName = networkState.mode === 'LOCAL' ? 'Local LAN' : 'Cloud + LAN';

    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `${changedDeviceName || 'Device'} ${stateAction}`,
        sub: `Confirmed via ${routeName} · Source: Simulator`,
        time: nowTime,
        type: deviceType
      },
      ...prev.slice(0, 5)
    ]);

    addNotification({
      type: 'success',
      title: `${changedDeviceName || 'Device'} ${stateAction}`,
      message: `State updated via ${routeName} (${elapsed}ms · Source: Simulator).`
    });

    return true;
  }, [networkState.mode, addNotification]);

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
            title: 'Failover to Local LAN Mode',
            sub: `Transitioned in ${fallbackDuration}ms · Source: Simulator`,
            time: resolvedTime,
            type: 'network'
          },
          ...prev.slice(0, 5)
        ]);

        setExperimentLogs((prev) => [
          {
            id: `EXP-${Date.now().toString().slice(-4)}`,
            time: resolvedTime,
            test: 'T2: Internet Partition',
            internet: 'OFF',
            lan: 'ON',
            expected: 'LOCAL',
            measured: `${fallbackDuration} ms`,
            result: 'PASS · Simulator'
          },
          ...prev
        ]);

        addNotification({
          type: 'warning',
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
          test: 'T3: Total Network Outage',
          internet: 'OFF',
          lan: 'OFF',
          expected: 'UNAVAILABLE',
          measured: '12 ms',
          result: 'PASS · Simulator'
        },
        ...prev
      ]);

      setRecentActivity((prev) => [
        {
          id: `act-${Date.now()}`,
          title: 'Total Network Outage',
          sub: 'UNAVAILABLE · Controls locked · Source: Simulator',
          time: nowTime,
          type: 'network'
        },
        ...prev.slice(0, 5)
      ]);

      addNotification({
        type: 'error',
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
            test: 'T4: Carrier Recovery & Sync',
            internet: 'RESTORED',
            lan: 'ON',
            expected: 'NORMAL',
            measured: '785 ms',
            result: 'PASS · Simulator'
          },
          ...prev
        ]);

        setRecentActivity((prev) => [
          {
            id: `act-${Date.now()}`,
            title: 'Cloud connection synchronized',
            sub: 'NORMAL · Dual-path active · Source: Simulator',
            time: recoveredTime,
            type: 'network'
          },
          ...prev.slice(0, 5)
        ]);

        addNotification({
          type: 'success',
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
          s.type === 'smoke' ? { ...s, status: 'NORMAL', value: 'Clear' } : s
        )
      }))
    );

    setExperimentLogs((prev) => [
      {
        id: `EXP-${Date.now().toString().slice(-4)}`,
        time: nowTime,
        test: 'T1: Normal Baseline Engaged',
        internet: 'ON',
        lan: 'ON',
        expected: 'NORMAL',
        measured: '18 ms',
        result: 'PASS · Simulator'
      },
      ...prev
    ]);

    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        title: 'Normal baseline restored',
        sub: 'NORMAL · Dual-path active · Source: Simulator',
        time: nowTime,
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);

    addNotification({
      type: 'success',
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
    dismissNotification,
    toggleDevice,
    triggerFault,
    restoreNormal,
    resetSystemState
  };
}
