import { Globe, Network, Radio, Wifi } from 'lucide-react';
import styles from './ConnectionStatus.module.css';

const BRIDGE_STATUS_LABELS = {
  'not-configured': 'Standby (Local Mode)',
  'authentication-required': 'Auth Required',
  unauthorized: 'Access Denied',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  unavailable: 'Offline'
};

function getStatusClass(status) {
  if (status === 'connected') {
    return styles.valSuccess;
  }
  if (status === 'unavailable' || status === 'unauthorized') {
    return styles.valFailed;
  }
  return styles.valWarn;
}

export default function ConnectionStatus({ networkState, bridgeState = { status: 'connected' }, onConnectBridge }) {
  const { internet, localLan, mqttBroker } = networkState;
  const hasBridgeObj = bridgeState && typeof bridgeState === 'object' && 'lastMessageAt' in bridgeState;

  const bridgeLabel = hasBridgeObj
    ? (BRIDGE_STATUS_LABELS[bridgeState.status] || 'Active')
    : (mqttBroker ? 'Active' : 'Standby');

  const messageLabel = hasBridgeObj
    ? (!bridgeState.lastMessageAt
      ? (bridgeState.status === 'connected' ? 'Listening on Topic' : 'Ready (LAN HTTP)')
      : (bridgeState.messageStale ? 'Stale (>70s)' : 'Heartbeat Active'))
    : 'Ready';

  const lastMessageTime = hasBridgeObj && bridgeState.lastMessageAt
    ? new Date(bridgeState.lastMessageAt).toLocaleTimeString()
    : null;

  return (
    <div className={styles.channelsCard}>
      {/* 1. Internet */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Globe size={18} className={internet ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>Internet · Source: Simulator</span>
          <span className={`${styles.value} ${internet ? styles.valSuccess : styles.valFailed}`}>
            {internet ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 2. Local Network LAN */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Network size={18} className={localLan ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>Local Network · LAN</span>
          <span className={`${styles.value} ${localLan ? styles.valSuccess : styles.valFailed}`}>
            {localLan ? 'Available' : 'Unavailable'}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 3. MQTT Broker / Local Bridge */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Radio size={18} className={bridgeState?.status === 'connected' || mqttBroker ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>MQTT Broker · Source: Live</span>
          <span className={`${styles.value} ${hasBridgeObj ? getStatusClass(bridgeState.status) : styles.valSuccess}`}>
            {bridgeLabel}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 4. ESP32-S3 Gateway */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Wifi size={18} className={styles.iconGreen} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>ESP32-S3 · Edge Gateway</span>
          <span className={styles.value}>
            {messageLabel}
          </span>
          {lastMessageTime && (
            <span className={styles.detail}>Last packet · {lastMessageTime}</span>
          )}
        </div>
      </div>

      {hasBridgeObj && bridgeState.error && bridgeState.status !== 'not-configured' && (
        <p className={styles.bridgeNotice} role="status" aria-live="polite">
          {bridgeState.error}
        </p>
      )}

      {onConnectBridge && hasBridgeObj && ['unauthorized', 'unavailable'].includes(bridgeState.status) && (
        <div className={styles.bridgeAuth}>
          <button type="button" onClick={onConnectBridge}>
            Reconnect MQTT Bridge
          </button>
        </div>
      )}
    </div>
  );
}
