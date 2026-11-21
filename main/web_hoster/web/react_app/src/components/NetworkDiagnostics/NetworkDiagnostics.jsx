import { useState } from 'react';
import { ArrowLeft, Cpu, Globe, Network, Radio, Server, RefreshCw, Wifi, ShieldCheck, AlertCircle } from 'lucide-react';
import styles from './NetworkDiagnostics.module.css';

const BRIDGE_STATUS_LABELS = {
  'not-configured': 'STANDBY (LOCAL)',
  connecting: 'CONNECTING',
  connected: 'CONNECTED',
  reconnecting: 'RECONNECTING',
  unavailable: 'OFFLINE',
  unauthorized: 'AUTH REQUIRED'
};

function getLastMessageLabel(bridgeState) {
  if (!bridgeState?.lastMessageAt) {
    return 'Listening for ESP32 packets';
  }
  return bridgeState.messageStale ? 'Stale (>70s)' : 'Live packet verified';
}

export default function NetworkDiagnostics({
  networkState,
  bridgeState = { status: 'not-configured', lastMessageAt: null, lastMessage: null, messageStale: false, error: null },
  onBackToDashboard,
  onSelectScreen,
  isVisitor = false
}) {
  const [pingStatus, setPingStatus] = useState(null);
  const [isPinging, setIsPinging] = useState(false);

  const isBridgeConnected = bridgeState?.status === 'connected';
  const lastMessageTime = bridgeState?.lastMessageAt
    ? new Date(bridgeState.lastMessageAt).toLocaleString()
    : 'Awaiting packet';

  const handleRunPing = () => {
    setIsPinging(true);
    setPingStatus('Probing Local Gateway & MQTT Broker routes...');
    setTimeout(() => {
      setIsPinging(false);
      if (!networkState?.localLan) {
        setPingStatus('PING FAILED: Local Gateway 192.168.1.1 Unreachable (LAN Offline)');
      } else if (!networkState?.internet) {
        setPingStatus('LAN HEALTHY: Gateway 192.168.1.1 (12ms) · External WAN unreachable (Local Fallback Active)');
      } else {
        setPingStatus('ALL CHANNELS HEALTHY: Local Gateway (11ms) · MQTT Broker (18ms) · 0% packet loss');
      }
    }, 500);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
          title={isVisitor ? 'Return to Sensors View' : 'Return to Home Overview'}
        >
          <ArrowLeft size={18} />
          <span>{isVisitor ? 'Back to Sensors' : 'Back to Overview'}</span>
        </button>

        <div className={styles.screenTag}>
          Screen S3: Network &amp; Channel Diagnostics
        </div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Network Topology &amp; Channel Diagnostics</h2>
        <p className={styles.subtitle}>
          Real-time link telemetry across cloud routing, domestic LAN gateway, and the local MQTT broker bridge.
        </p>
      </div>

      {/* Topology Nodes Grid */}
      <div className={styles.topologyGrid}>
        {/* Node 1: Cloud Route */}
        <div className={`${styles.nodeCard} ${networkState?.internet ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Globe size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {networkState?.internet ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>
          <h3 className={styles.nodeName}>External Cloud Uplink</h3>
          <p className={styles.nodeDesc}>Remote telemetry synchronization &amp; WAN route</p>
          <div className={styles.nodeMeta}>
            <span>State: <strong>{networkState?.internet ? 'Online (Reachable)' : 'Disconnected (Failover)'}</strong></span>
            <span>Source: <code>Simulator</code></span>
          </div>
        </div>

        {/* Node 2: Domestic Router / LAN */}
        <div className={`${styles.nodeCard} ${networkState?.localLan ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Network size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {networkState?.localLan ? 'ACTIVE' : 'OFFLINE'}
            </span>
          </div>
          <h3 className={styles.nodeName}>Domestic Router / LAN</h3>
          <p className={styles.nodeDesc}>Local IP Gateway &amp; Hotspot Subnet</p>
          <div className={styles.nodeMeta}>
            <span>Gateway IP: <code>192.168.137.1</code></span>
            <span>Source: <code>Simulator</code></span>
          </div>
        </div>

        {/* Node 3: ESP32-S3 Edge Gateway */}
        <div className={`${styles.nodeCard} ${networkState?.localLan ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Cpu size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {networkState?.localLan ? 'ONLINE' : 'UNREACHABLE'}
            </span>
          </div>
          <h3 className={styles.nodeName}>ESP32-S3 Edge Gateway</h3>
          <p className={styles.nodeDesc}>Embedded WebHoster &amp; Local Zone Controller</p>
          <div className={styles.nodeMeta}>
            <span>Host: <code>http://esp32-lan.local</code></span>
            <span>Source: <code>Simulator</code></span>
          </div>
        </div>

        {/* Node 4: MQTT Broker via Local Bridge */}
        <div className={`${styles.nodeCard} ${isBridgeConnected ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Radio size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {BRIDGE_STATUS_LABELS[bridgeState?.status] || 'STANDBY'}
            </span>
          </div>
          <h3 className={styles.nodeName}>Docker Mosquitto &amp; LAN Bridge</h3>
          <p className={styles.nodeDesc}>TLS :8883 / WSS :8084 &amp; Node.js Auth Bridge (:8081)</p>
          <div className={styles.nodeMeta}>
            <span>Packet status: <strong>{getLastMessageLabel(bridgeState)}</strong></span>
            <span>Last packet: <code>{lastMessageTime}</code></span>
            {bridgeState?.lastMessage && (
              <span>Sequence: <code>#{bridgeState.lastMessage.sequence}</code></span>
            )}
            <span>Source: <code>Live MQTT</code></span>
          </div>
        </div>
      </div>

      {/* Benchmark & Live Connectivity Probe */}
      <div className={styles.diagnosticToolCard}>
        <div className={styles.toolHeader}>
          <div className={styles.toolTitleGroup}>
            <Server size={20} className={styles.toolIcon} />
            <div>
              <h3 className={styles.toolTitle}>Link Benchmark &amp; MQTT Telemetry Channel</h3>
              <p className={styles.toolSubtitle}>
                Verify local gateway reachability and inspect live MQTT connectivity frames from the ESP32-S3 node.
              </p>
            </div>
          </div>

          <button
            type="button"
            className={styles.pingButton}
            onClick={handleRunPing}
            disabled={isPinging}
          >
            <RefreshCw size={16} className={isPinging ? styles.spin : ''} />
            <span>{isPinging ? 'Probing Links...' : 'Run Link Probe'}</span>
          </button>
        </div>

        {pingStatus && (
          <div className={styles.pingConsole} role="status" aria-live="polite">
            <span className={styles.consolePrompt}>$ safehaven-probe --gateway</span>
            <span className={styles.consoleResult}>{pingStatus}</span>
          </div>
        )}

        <div className={styles.specsRow}>
          <div className={styles.specItem}>
            <Radio size={16} />
            <span>Bridge Status: <strong>{BRIDGE_STATUS_LABELS[bridgeState?.status] || 'STANDBY'}</strong></span>
          </div>
          <div className={styles.specItem}>
            <Wifi size={16} />
            <span>Wi-Fi Signal (RSSI): <strong>-42 dBm (Excellent)</strong></span>
          </div>
          <div className={styles.specItem}>
            <ShieldCheck size={16} />
            <span>Failover Target: <strong>&lt; 500ms Local Switching</strong></span>
          </div>
        </div>

        {!isVisitor && onSelectScreen && (
          <div className={styles.specsRow}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => onSelectScreen('LOCAL_FALLBACK')}
            >
              <AlertCircle size={15} />
              <span>Open Local Fallback Matrix (Screen S4)</span>
            </button>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => onSelectScreen('RECOVERY')}
            >
              <RefreshCw size={15} />
              <span>Open Cloud Sync Pipeline (Screen S5)</span>
            </button>
          </div>
        )}

        {bridgeState?.error && bridgeState.status !== 'not-configured' && (
          <div className={styles.pingConsole} role="status" aria-live="polite">
            <span className={styles.bridgeError}>{bridgeState.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
