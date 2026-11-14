import { Globe, Network, Radio, Wifi } from 'lucide-react';
import styles from './ConnectionStatus.module.css';

const BRIDGE_STATUS_LABELS = {
  'not-configured': 'Not configured',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  unavailable: 'Unavailable'
};

function getStatusClass(status) {
  if (status === 'connected') {
    return styles.valSuccess;
  }
  if (status === 'unavailable' || status === 'not-configured') {
    return styles.valFailed;
  }
  return styles.valWarn;
}

export default function ConnectionStatus({ networkState, bridgeState }) {
  const { internet, localLan } = networkState;
  const bridgeLabel = BRIDGE_STATUS_LABELS[bridgeState.status] || 'Unknown';
  const messageLabel = !bridgeState.lastMessageAt
    ? (bridgeState.status === 'connected' ? 'Awaiting test message' : 'No test message yet')
    : bridgeState.messageStale
      ? 'Stale'
      : 'Received recently';
  const messageClass = !bridgeState.lastMessageAt || bridgeState.messageStale
    ? styles.valWarn
    : styles.valSuccess;
  const lastMessageTime = bridgeState.lastMessageAt
    ? new Date(bridgeState.lastMessageAt).toLocaleTimeString()
    : null;

  return (
    <div className={styles.channelsCard}>
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Globe size={18} className={internet ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>Internet · simulated</span>
          <span className={`${styles.value} ${internet ? styles.valSuccess : styles.valFailed}`}>
            {internet ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Network size={18} className={localLan ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>Local network · simulated</span>
          <span className={`${styles.value} ${localLan ? styles.valSuccess : styles.valFailed}`}>
            {localLan ? 'Available' : 'Unavailable'}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Radio size={18} className={bridgeState.status === 'connected' ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>MQTT broker · local bridge</span>
          <span className={`${styles.value} ${getStatusClass(bridgeState.status)}`}>
            {bridgeLabel}
          </span>
          <span className={styles.detail}>Browser-to-bridge connection only</span>
        </div>
      </div>

      <div className={styles.divider}></div>

      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Wifi size={18} className={messageClass} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>ESP32 connectivity test</span>
          <span className={`${styles.value} ${messageClass}`}>
            {messageLabel}
          </span>
          <span className={styles.detail}>
            {lastMessageTime
              ? `Last test message · ${lastMessageTime}`
              : 'No sensor readings or device state'}
          </span>
        </div>
      </div>

      {bridgeState.error && (
        <p className={styles.bridgeNotice} role="status" aria-live="polite">
          {bridgeState.error}
        </p>
      )}
    </div>
  );
}
