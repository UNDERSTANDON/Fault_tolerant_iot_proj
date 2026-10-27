import { useState, useCallback, useRef, useEffect } from 'react';
import { INITIAL_ROOMS_DATA, INITIAL_NETWORK_STATE, NETWORK_MODES } from '../data/initialMockData';

export function useSmartHome() {
  const [rooms, setRooms] = useState(INITIAL_ROOMS_DATA);
  const [networkState, setNetworkState] = useState(INITIAL_NETWORK_STATE);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [isSmokeAlert, setIsSmokeAlert] = useState(false);

  // Bug 5 Fix: Dynamic Recent Activity List
  const [recentActivity, setRecentActivity] = useState([
    {
      id: 'act-1',
      title: 'Living room light turned on',
      sub: 'ACK received · ON',
      time: '10:23:42',
      type: 'light'
    },
    {
      id: 'act-2',
      title: 'Living room fan turned off',
      sub: 'ACK received · OFF',
      time: '10:23:10',
      type: 'fan'
    },
    {
      id: 'act-3',
      title: 'Local connection stable',
      sub: 'NORMAL · All devices ready',
      time: '10:22:05',
      type: 'network'
    }
  ]);

  // Bug 3 Fix: Dynamic Research Experiment History
  const [experimentLogs, setExperimentLogs] = useState([
    { id: 'EXP-101', time: '10:20:10', test: 'T1: Normal Baseline', internet: 'ON', lan: 'ON', expected: 'NORMAL', measured: '18 ms', result: 'PASS' },
    { id: 'EXP-102', time: '10:21:40', test: 'T2: Internet Partition', internet: 'OFF', lan: 'ON', expected: 'LOCAL', measured: '320 ms', result: 'PASS' },
    { id: 'EXP-103', time: '10:22:05', test: 'T3: LAN Router Failure', internet: 'OFF', lan: 'OFF', expected: 'UNAVAILABLE', measured: '12 ms', result: 'PASS' },
    { id: 'EXP-104', time: '10:23:15', test: 'T4: Carrier Recovery', internet: 'RESTORED', lan: 'ON', expected: 'NORMAL', measured: '780 ms', result: 'PASS' }
  ]);

  const [notifications, setNotifications] = useState([
    {
      id: 'init-1',
      type: 'info',
      title: 'Smart Home System Ready',
      message: '4 domestic zones initialized and operating in Normal Mode.',
      time: new Date().toLocaleTimeString('en-US')
    }
  ]);

  const [metrics, setMetrics] = useState({
    fallbackTimeMs: 0,
    avgResponseTimeMs: 24,
    commandsTotal: 0,
    commandsSuccess: 0
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

  // Toggle Smoke Hazard Alarm
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
        title: triggerAlert ? 'Smoke Hazard Alarm Triggered' : 'Smoke Alarm Reset to Normal',
        sub: triggerAlert ? 'ALERT · Particulate detected' : 'NORMAL · Air clear',
        time: nowTime,
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);

    if (triggerAlert) {
      addNotification({
        type: 'error',
        title: 'CRITICAL HAZARD: Smoke Detected!',
        message: 'Kitchen and Living Room MQ-2 sensors detected smoke particulates. Automated safety alert engaged.'
      });
    } else {
      addNotification({
        type: 'success',
        title: 'Hazard Cleared: Normal Air Quality',
        message: 'Smoke particulate levels returned to safe atmospheric limits.'
      });
    }
  }, [addNotification]);

  // Handle device toggle command
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
        title: 'Command Execution Rejected',
        message: 'System is UNAVAILABLE. Local LAN and ESP32 Gateway are unreachable.'
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

    // Update research metrics
    setMetrics((prev) => {
      const newTotal = prev.commandsTotal + 1;
      const newSuccess = prev.commandsSuccess + 1;
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
    const routeName = networkState.mode === 'LOCAL' ? 'via Local LAN' : 'via Cloud/Internet';

    // Bug 5 Fix: Add to dynamic Recent Activity
    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `${changedDeviceName || 'Device'} ${stateAction}`,
        sub: `ACK received · ${isLockType ? (targetState ? 'UNLOCKED' : 'LOCKED') : (targetState ? 'ON' : 'OFF')} (${networkState.mode})`,
        time: nowTime,
        type: deviceType
      },
      ...prev.slice(0, 5)
    ]);

    // Trigger success notification
    addNotification({
      type: 'success',
      title: `Command Executed (${routeName})`,
      message: `Successfully ${stateAction} ${changedDeviceName || 'device'}.`
    });

    return true;
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
        title: 'Internet Disconnection Detected',
        message: 'Establishing failover routing to Local Area Network (LAN)...'
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
            title: 'Switched to local control',
            sub: 'LOCAL · LAN & MQTT available',
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
          title: 'LOCAL MODE ACTIVATED (Fallback Mode)',
          message: `Failover completed in ${fallbackDuration}ms. Local domestic switches are fully operational!`
        });
      }, 400);
    } else if (faultType === 'LAN_DOWN') {
      // Full LAN failure -> UNAVAILABLE
      setNetworkState({
        mode: NETWORK_MODES.UNAVAILABLE,
        internet: false,
        localLan: false,
        mqttBroker: false,
        latencyMs: 0,
        lastUpdated: nowTime
      });

      // Bug 3: Log to Experiment History
      setExperimentLogs((prev) => [
        {
          id: `EXP-${Date.now().toString().slice(-4)}`,
          time: nowTime,
          test: 'T3: Total Network Outage',
          internet: 'OFF',
          lan: 'OFF',
          expected: 'UNAVAILABLE',
          measured: '12 ms',
          result: 'PASS'
        },
        ...prev
      ]);

      // Bug 5: Log to Recent Activity
      setRecentActivity((prev) => [
        {
          id: `act-${Date.now()}`,
          title: 'Complete Network Outage',
          sub: 'UNAVAILABLE · Controls locked',
          time: nowTime,
          type: 'network'
        },
        ...prev.slice(0, 5)
      ]);

      addNotification({
        type: 'error',
        title: 'COMPLETE NETWORK OUTAGE',
        message: 'Both Local LAN and ESP32 Gateway are unreachable. Controls are locked temporarily.'
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
        title: 'Internet Connection Re-acquired',
        message: 'Synchronizing local telemetry buffers with cloud server...'
      });

      // Step 2: After 800ms restored to NORMAL
      transitionTimerRef.current = setTimeout(() => {
        const recoveredTime = new Date().toLocaleTimeString('en-US');
        setNetworkState({
          mode: NETWORK_MODES.NORMAL,
          internet: true,
          localLan: true,
          mqttBroker: true,
          latencyMs: 22,
          lastUpdated: recoveredTime
        });

        // Bug 3: Log to Experiment History
        setExperimentLogs((prev) => [
          {
            id: `EXP-${Date.now().toString().slice(-4)}`,
            time: recoveredTime,
            test: 'T4: Carrier Recovery & Sync',
            internet: 'RESTORED',
            lan: 'ON',
            expected: 'NORMAL',
            measured: '790 ms',
            result: 'PASS'
          },
          ...prev
        ]);

        // Bug 5: Log to Recent Activity
        setRecentActivity((prev) => [
          {
            id: `act-${Date.now()}`,
            title: 'Cloud connection restored',
            sub: 'NORMAL · Synchronized with broker',
            time: recoveredTime,
            type: 'network'
          },
          ...prev.slice(0, 5)
        ]);

        addNotification({
          type: 'success',
          title: 'NORMAL MODE RESTORED',
          message: 'Cloud connection re-established. Domestic telemetry fully synchronized.'
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
        test: 'T1: Normal Baseline Engaged',
        internet: 'ON',
        lan: 'ON',
        expected: 'NORMAL',
        measured: '18 ms',
        result: 'PASS'
      },
      ...prev
    ]);

    // Bug 5: Log to Recent Activity
    setRecentActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        title: 'Reset to Normal baseline',
        sub: 'NORMAL · Dual-path active',
        time: nowTime,
        type: 'network'
      },
      ...prev.slice(0, 5)
    ]);

    addNotification({
      type: 'success',
      title: 'Normal Mode Restored',
      message: 'Internet, Local LAN, and all connected devices are fully online.'
    });
  }, [addNotification]);

  return {
    rooms,
    networkState,
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
