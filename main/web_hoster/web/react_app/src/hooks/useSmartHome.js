import { useState, useCallback, useRef, useEffect } from 'react';
import { INITIAL_ROOMS_DATA, INITIAL_NETWORK_STATE, NETWORK_MODES } from '../data/initialMockData';

const TEST_TOPIC = 'demo/esp32-mqtt-connectivity/test';
const TEST_MESSAGE_STALE_AFTER_MS = 70000;

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
  const [rooms, setRooms] = useState(INITIAL_ROOMS_DATA);
  const [networkState, setNetworkState] = useState(INITIAL_NETWORK_STATE);
  const [bridgeState, setBridgeState] = useState({
    status: localBridgeUrl ? 'connecting' : 'not-configured',
    lastMessageAt: null,
    lastMessage: null,
    messageStale: false,
    error: localBridgeUrl ? null : 'Local MQTT bridge is not configured.'
  });
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [isSmokeAlert, setIsSmokeAlert] = useState(false);

  useEffect(() => {
    if (!localBridgeUrl) {
      return undefined;
    }

    let socket;
    let isActive = true;
    let reconnectTimer;
    let reconnectAttempt = 0;

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
      } catch {
        setBridgeState((current) => ({
          ...current,
          status: 'unavailable',
          error: 'Could not open the local bridge connection; check its URL and browser WebSocket support.'
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

          if (message.type === 'status') {
            if (!['connected', 'reconnecting', 'unavailable'].includes(message.state)) {
              setBridgeState((current) => ({
                ...current,
                error: 'The local bridge returned an unrecognized connection status.'
              }));
              return;
            }

            setBridgeState((current) => ({
              ...current,
              status: message.state,
              error: message.state === 'unavailable'
                ? 'The local bridge cannot reach the MQTT broker.'
                : null
            }));
            return;
          }

          if (message.type === 'mqtt-message') {
            if (!isConnectivityTestPayload(message.topic, message.payload)) {
              setBridgeState((current) => ({
                ...current,
                error: 'The bridge received an invalid or unexpected MQTT test message.'
              }));
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
                title: 'ESP32 connectivity test received',
                sub: `Test data · sequence ${message.payload.sequence} · not an acknowledgement`,
                time: new Date(receivedAt).toLocaleTimeString('en-US'),
                type: 'network'
              },
              ...previous.slice(0, 5)
            ]);
            return;
          }

          if (message.type === 'error') {
            setBridgeState((current) => ({
              ...current,
              error: 'The local bridge rejected a browser message.'
            }));
            return;
          }

          setBridgeState((current) => ({
            ...current,
            error: 'The local bridge returned an unsupported message.'
          }));
        } catch (error) {
          setBridgeState((current) => ({
            ...current,
            error: 'The local bridge returned malformed data.'
          }));
        }
      });

      socket.addEventListener('close', () => {
        if (!isActive) {
          return;
        }

        setBridgeState((current) => ({
          ...current,
          status: 'reconnecting',
          error: 'Connection to the local bridge was lost; retrying.'
        }));
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        if (!isActive) {
          return;
        }

        setBridgeState((current) => ({
          ...current,
          status: 'reconnecting',
          error: 'Unable to reach the local bridge; retrying.'
        }));
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
    };
  }, [localBridgeUrl]);

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

  // Bug 5 Fix: Dynamic Recent Activity List
  const [recentActivity, setRecentActivity] = useState([
    {
      id: 'act-1',
      title: 'Simulated living room light toggle',
      sub: 'Demo only · no device command sent',
      time: '10:23:42',
      type: 'light'
    },
    {
      id: 'act-2',
      title: 'Simulated living room fan toggle',
      sub: 'Demo only · no device command sent',
      time: '10:23:10',
      type: 'fan'
    },
    {
      id: 'act-3',
      title: 'Simulated network status',
      sub: 'Demo state · not a live network measurement',
      time: '10:22:05',
      type: 'network'
    }
  ]);

  // Bug 3 Fix: Dynamic Research Experiment History
  const [experimentLogs, setExperimentLogs] = useState([
    { id: 'EXP-101', time: '10:20:10', test: 'SIMULATED: Normal Baseline', internet: 'ON', lan: 'ON', expected: 'NORMAL', measured: '18 ms', result: 'SIMULATED' },
    { id: 'EXP-102', time: '10:21:40', test: 'SIMULATED: Internet Partition', internet: 'OFF', lan: 'ON', expected: 'LOCAL', measured: '320 ms', result: 'SIMULATED' },
    { id: 'EXP-103', time: '10:22:05', test: 'SIMULATED: LAN Router Failure', internet: 'OFF', lan: 'OFF', expected: 'UNAVAILABLE', measured: '12 ms', result: 'SIMULATED' },
    { id: 'EXP-104', time: '10:23:15', test: 'SIMULATED: Recovery', internet: 'RESTORED', lan: 'ON', expected: 'NORMAL', measured: '780 ms', result: 'SIMULATED' }
  ]);

  const [notifications, setNotifications] = useState([
    {
      id: 'init-1',
      type: 'info',
      title: 'Demo dashboard ready',
      message: 'Room and device values are simulated. MQTT connectivity-test messages appear only when the local bridge is configured.',
      time: new Date().toLocaleTimeString('en-US')
    }
  ]);

  const [metrics, setMetrics] = useState({
    fallbackTimeMs: 0,
    avgResponseTimeMs: 24,
    commandsTotal: 0
  });

  const transitionTimerRef = useRef(null);

  // Bug 2 Fix: Live natural sensor drift ONLY runs when network is NOT UNAVAILABLE
  useEffect(() => {
    const interval = setInterval(() => {
      // If network is completely down (UNAVAILABLE), sensor telemetry freezes (Stale data)
      setNetworkState((currentNet) => {
        if (currentNet.mode === NETWORK_MODES.UNAVAILABLE) {
          return currentNet; // Do not drift
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

  // Dismiss a notification
  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Add a new toast notification
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

  // Toggle the simulated smoke-alert display.
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

    // Prepend to dynamic activity
    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        title: triggerAlert ? 'Simulated smoke alert' : 'Simulated smoke state cleared',
        sub: 'Demo only · no physical sensor or safety action',
        time: nowTime,
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);

    if (triggerAlert) {
      addNotification({
        type: 'warning',
        title: 'Simulated smoke alert',
        message: 'Demo only: no physical smoke sensor was read and no safety action was triggered.'
      });
    } else {
      addNotification({
        type: 'info',
        title: 'Simulated smoke state cleared',
        message: 'Demo only: this does not report real air quality or a physical sensor state.'
      });
    }
  }, [addNotification]);

  // Simulate a device-state toggle without sending a hardware command.
  const toggleDevice = useCallback((deviceId, targetState) => {
    const startTime = performance.now();
    const nowTime = new Date().toLocaleTimeString('en-US');

    // If entire system is UNAVAILABLE, command rejected
    if (networkState.mode === NETWORK_MODES.UNAVAILABLE) {
      setMetrics((prev) => ({
        ...prev,
        commandsTotal: prev.commandsTotal + 1
      }));
      addNotification({
        type: 'error',
        title: 'Demo toggle paused',
        message: 'The simulated scenario is unavailable. No live network check or device command was attempted.'
      });
      return false;
    }

    let changedDeviceName = '';
    let isLockType = false;
    let deviceType = 'light';

    // Update target device state in corresponding room
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

    const elapsed = Math.round(performance.now() - startTime + (networkState.mode === 'LOCAL' ? 12 : 25));

    setMetrics((prev) => {
      const newTotal = prev.commandsTotal + 1;
      const newAvg = Math.round((prev.avgResponseTimeMs * prev.commandsTotal + elapsed) / newTotal);
      return {
        ...prev,
        commandsTotal: newTotal,
        avgResponseTimeMs: newAvg
      };
    });

    setNetworkState((prev) => ({
      ...prev,
      lastUpdated: nowTime
    }));

    const stateAction = isLockType
      ? (targetState ? 'Unlock' : 'Lock')
      : (targetState ? 'Turn on' : 'Turn off');

    // Bug 5 Fix: Add to dynamic Recent Activity
    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `Simulated ${stateAction.toLowerCase()}: ${changedDeviceName || 'device'}`,
        sub: 'Demo only · no device command sent',
        time: nowTime,
        type: deviceType
      },
      ...prev.slice(0, 5)
    ]);

    addNotification({
      type: 'info',
      title: 'Demo state changed (simulation)',
      message: `Updated the mock state for ${changedDeviceName || 'device'} only. No command was sent to the ESP32 or hardware.`
    });
  }, [networkState.mode, addNotification]);

  // Simulate network fault scenarios
  const triggerFault = useCallback((faultType) => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    const startTransitionTime = performance.now();
    const nowTime = new Date().toLocaleTimeString('en-US');

    if (faultType === 'INTERNET_DOWN') {
      // Step 1: SWITCHING
      setNetworkState((prev) => ({
        ...prev,
        mode: NETWORK_MODES.SWITCHING,
        internet: false,
        lastUpdated: nowTime
      }));

      addNotification({
        type: 'warning',
        title: 'Simulated internet outage',
        message: 'Changing the demo network state only; no live network check or route change is performed.'
      });

      // Step 2: After 400ms route resolved -> LOCAL MODE
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

        // Bug 5: Log to Recent Activity
        setRecentActivity((prev) => [
          {
            id: `act-${Date.now()}`,
            title: 'Simulated local mode',
            sub: 'Demo state only · LAN and MQTT availability not implied',
            time: resolvedTime,
            type: 'network'
          },
          ...prev.slice(0, 5)
        ]);

        // Bug 3: Log to Experiment History
        setExperimentLogs((prev) => [
          {
            id: `EXP-${Date.now().toString().slice(-4)}`,
            time: resolvedTime,
            test: 'SIMULATED: Internet Partition',
            internet: 'OFF',
            lan: 'ON',
            expected: 'LOCAL',
            measured: `${fallbackDuration} ms`,
            result: 'SIMULATED'
          },
          ...prev
        ]);

        addNotification({
          type: 'info',
          title: 'Simulated local mode',
          message: `The demo transition took ${fallbackDuration}ms; no network failover or device control was tested.`
        });
      }, 400);
    } else if (faultType === 'LAN_DOWN') {
      // Simulated full network failure.
      setNetworkState({
        mode: NETWORK_MODES.UNAVAILABLE,
        internet: false,
        localLan: false,
        latencyMs: 0,
        lastUpdated: nowTime
      });

      // Bug 3: Log to Experiment History
      setExperimentLogs((prev) => [
        {
          id: `EXP-${Date.now().toString().slice(-4)}`,
          time: nowTime,
          test: 'SIMULATED: Total Network Outage',
          internet: 'OFF',
          lan: 'OFF',
          expected: 'UNAVAILABLE',
          measured: '12 ms',
          result: 'SIMULATED'
        },
        ...prev
      ]);

      // Bug 5: Log to Recent Activity
      setRecentActivity((prev) => [
        {
          id: `act-${Date.now()}`,
          title: 'Simulated network outage',
          sub: 'Demo controls paused · no live reachability check',
          time: nowTime,
          type: 'network'
        },
        ...prev.slice(0, 5)
      ]);

      addNotification({
        type: 'error',
        title: 'Simulated network outage',
        message: 'Demo controls are paused. Live ESP32 and LAN availability are not known.'
      });
    } else if (faultType === 'SIMULATE_RECOVERY') {
      // Step 1: RECONNECTING
      setNetworkState((prev) => ({
        ...prev,
        mode: NETWORK_MODES.RECONNECTING,
        internet: true,
        lastUpdated: nowTime
      }));

      addNotification({
        type: 'info',
        title: 'Simulated recovery started',
        message: 'This demo does not connect to a cloud service or replay telemetry.'
      });

      // Step 2: After 800ms restored to NORMAL
      transitionTimerRef.current = setTimeout(() => {
        const recoveredTime = new Date().toLocaleTimeString('en-US');
        setNetworkState({
          mode: NETWORK_MODES.NORMAL,
          internet: true,
          localLan: true,
          latencyMs: 22,
          lastUpdated: recoveredTime
        });

        // Bug 3: Log to Experiment History
        setExperimentLogs((prev) => [
          {
            id: `EXP-${Date.now().toString().slice(-4)}`,
            time: recoveredTime,
            test: 'SIMULATED: Carrier Recovery',
            internet: 'RESTORED',
            lan: 'ON',
            expected: 'NORMAL',
            measured: '790 ms',
            result: 'SIMULATED'
          },
          ...prev
        ]);

        // Bug 5: Log to Recent Activity
        setRecentActivity((prev) => [
          {
            id: `act-${Date.now()}`,
            title: 'Simulated recovery complete',
            sub: 'Demo state only · no cloud or broker sync performed',
            time: recoveredTime,
            type: 'network'
          },
          ...prev.slice(0, 5)
        ]);

        addNotification({
          type: 'info',
          title: 'Simulated recovery complete',
          message: 'The demo state was reset; no cloud connection or telemetry synchronization occurred.'
        });
      }, 800);
    }
  }, [addNotification]);

  // Restore to initial normal mode
  const restoreNormal = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    const nowTime = new Date().toLocaleTimeString('en-US');
    setNetworkState(INITIAL_NETWORK_STATE);
    setIsSmokeAlert(false);

    // Bug 3: Log to Experiment History
    setExperimentLogs((prev) => [
      {
        id: `EXP-${Date.now().toString().slice(-4)}`,
        time: nowTime,
        test: 'SIMULATED: Normal Baseline',
        internet: 'ON',
        lan: 'ON',
        expected: 'NORMAL',
        measured: '18 ms',
        result: 'SIMULATED'
      },
      ...prev
    ]);

    // Bug 5: Log to Recent Activity
    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        title: 'Simulated baseline restored',
        sub: 'Demo state only · live network state unchanged',
        time: nowTime,
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);

    addNotification({
      type: 'info',
      title: 'Simulated baseline restored',
      message: 'Demo network state reset. Live internet, LAN, and device states were not checked.'
    });
  }, [addNotification]);

  return {
    rooms,
    networkState,
    bridgeState,
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
    restoreNormal
  };
}
