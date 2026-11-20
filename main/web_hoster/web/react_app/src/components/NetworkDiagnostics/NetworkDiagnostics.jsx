import { ArrowLeft, Cpu, Globe, Network, Radio, Server } from 'lucide-react';
import styles from './NetworkDiagnostics.module.css';

const BRIDGE_STATUS_LABELS = {
  'not-configured': 'NOT CONFIGURED',
  connecting: 'CONNECTING',
  connected: 'CONNECTED',
  reconnecting: 'RECONNECTING',
  unavailable: 'UNAVAILABLE'
};

function getLastMessageLabel(bridgeState) {
  if (!bridgeState.lastMessageAt) {
    return 'No test message received';
  }
  return bridgeState.messageStale ? 'Stale' : 'Recent test message';
}

export default function NetworkDiagnostics({ networkState, bridgeState, onBackToDashboard }) {
  const isBridgeConnected = bridgeState.status === 'connected';
  const lastMessageTime = bridgeState.lastMessageAt
    ? new Date(bridgeState.lastMessageAt).toLocaleString()
    : 'Never';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
          title="Return to Main Dashboard"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>
        <div className={styles.screenTag}>Connection diagnostics</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Network & MQTT diagnostics</h2>
        <p className={styles.subtitle}>
          MQTT bridge and ESP32 test-message status are live. Internet and LAN scenario values below are simulated.
        </p>
      </div>

      <div className={styles.topologyGrid}>
        <div className={`${styles.nodeCard} ${networkState.internet ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Globe size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {networkState.internet ? 'SIMULATED ONLINE' : 'SIMULATED OFFLINE'}
            </span>
          </div>
          <h3 className={styles.nodeName}>Internet scenario</h3>
          <p className={styles.nodeDesc}>Fault-simulation state only; no internet probe is performed.</p>
          <div className={styles.nodeMeta}>
            <span>Demo state: <strong>{networkState.internet ? 'Connected' : 'Disconnected'}</strong></span>
          </div>
        </div>

        <div className={`${styles.nodeCard} ${networkState.localLan ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Network size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {networkState.localLan ? 'SIMULATED ACTIVE' : 'SIMULATED OFFLINE'}
            </span>
          </div>
          <h3 className={styles.nodeName}>Local network scenario</h3>
          <p className={styles.nodeDesc}>Fault-simulation state only; no LAN reachability probe is performed.</p>
          <div className={styles.nodeMeta}>
            <span>Demo state: <strong>{networkState.localLan ? 'Available' : 'Unavailable'}</strong></span>
          </div>
        </div>

        <div className={`${styles.nodeCard} ${styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Cpu size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>NOT IMPLEMENTED</span>
          </div>
          <h3 className={styles.nodeName}>ESP32 device API</h3>
          <p className={styles.nodeDesc}>No device status or command API is connected to this dashboard.</p>
          <div className={styles.nodeMeta}>
            <span>Device controls and room readings are simulated.</span>
          </div>
        </div>

        <div className={`${styles.nodeCard} ${isBridgeConnected ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Radio size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {BRIDGE_STATUS_LABELS[bridgeState.status] || 'UNKNOWN'}
            </span>
          </div>
          <h3 className={styles.nodeName}>MQTT broker via local bridge</h3>
          <p className={styles.nodeDesc}>Actual browser-to-bridge and Node-to-broker status.</p>
          <div className={styles.nodeMeta}>
            <span>ESP32 test message: <strong>{getLastMessageLabel(bridgeState)}</strong></span>
            <span>Last received: <code>{lastMessageTime}</code></span>
            {bridgeState.lastMessage && (
              <span>Sequence: <code>{bridgeState.lastMessage.sequence}</code></span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.diagnosticToolCard}>
        <div className={styles.toolHeader}>
          <div className={styles.toolTitleGroup}>
            <Server size={20} className={styles.toolIcon} />
            <div>
              <h3 className={styles.toolTitle}>Live connectivity-test channel</h3>
              <p className={styles.toolSubtitle}>
                The ESP32 publishes test messages; this is not sensor telemetry or a device acknowledgement.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.specsRow}>
          <div className={styles.specItem}>
            <Radio size={16} />
            <span>Bridge: <strong>{BRIDGE_STATUS_LABELS[bridgeState.status] || 'UNKNOWN'}</strong></span>
          </div>
          <div className={styles.specItem}>
            <Cpu size={16} />
            <span>Topic: <code>demo/esp32-mqtt-connectivity/test</code></span>
          </div>
          <div className={styles.specItem}>
            <Network size={16} />
            <span>Freshness: <strong>{getLastMessageLabel(bridgeState)}</strong></span>
          </div>
        </div>

        {bridgeState.error && (
          <div className={styles.pingConsole} role="status" aria-live="polite">
            <span className={styles.bridgeError}>{bridgeState.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
