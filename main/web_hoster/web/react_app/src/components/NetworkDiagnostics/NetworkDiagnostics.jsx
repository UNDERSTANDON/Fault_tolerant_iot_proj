import { useState } from 'react';
import { ArrowLeft, Globe, Network, Cpu, Radio, ShieldCheck, AlertCircle, RefreshCw, Server, Wifi } from 'lucide-react';
import styles from './NetworkDiagnostics.module.css';

export default function NetworkDiagnostics({ networkState, onBackToDashboard }) {
  const [pingStatus, setPingStatus] = useState(null);
  const [isPinging, setIsPinging] = useState(false);

  const handleRunPing = () => {
    setIsPinging(true);
    setPingStatus('Pinging Gateway & Cloud Broker...');
    setTimeout(() => {
      setIsPinging(false);
      if (!networkState.localLan) {
        setPingStatus('PING FAILED: Destination Host Unreachable (LAN Down)');
      } else if (!networkState.internet) {
        setPingStatus('PING LOCAL OK: Gateway 192.168.1.1 (12ms) | Cloud 8.8.8.8 (100% packet loss)');
      } else {
        setPingStatus('ALL CHANNELS HEALTHY: Gateway (11ms) | Cloud Broker (28ms) | 0% packet loss');
      }
    }, 600);
  };

  return (
    <div className={styles.container}>
      {/* Navigation Header */}
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
        <div className={styles.screenTag}>Screen S3: Network & Channel Diagnostics</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Network Topology & Channel Diagnostics</h2>
        <p className={styles.subtitle}>
          In-depth telemetry for external cloud routes, domestic LAN broadcast, and ESP32 gateway links.
        </p>
      </div>

      {/* Network Topology Cards */}
      <div className={styles.topologyGrid}>
        {/* Node 1: Cloud Service */}
        <div className={`${styles.nodeCard} ${networkState.internet ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Globe size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>{networkState.internet ? 'CONNECTED' : 'DISCONNECTED'}</span>
          </div>
          <h3 className={styles.nodeName}>Public Cloud Broker</h3>
          <p className={styles.nodeDesc}>MQTT over TLS / Remote REST API</p>
          <div className={styles.nodeMeta}>
            <span>Endpoint: <code>broker.hivemq.com:8884</code></span>
            <span>Status: <strong>{networkState.internet ? 'Online (Accessible)' : 'Unreachable (Timeout)'}</strong></span>
          </div>
        </div>

        {/* Node 2: Home Wi-Fi Router */}
        <div className={`${styles.nodeCard} ${networkState.localLan ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Network size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>{networkState.localLan ? 'ACTIVE' : 'OFFLINE'}</span>
          </div>
          <h3 className={styles.nodeName}>Domestic Router / LAN</h3>
          <p className={styles.nodeDesc}>Local IP Gateway & Subnet Bridge</p>
          <div className={styles.nodeMeta}>
            <span>Gateway IP: <code>192.168.1.1</code></span>
            <span>Subnet: <code>255.255.255.0</code></span>
          </div>
        </div>

        {/* Node 3: ESP32 Access Point Gateway */}
        <div className={`${styles.nodeCard} ${networkState.localLan ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Cpu size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>{networkState.localLan ? 'ONLINE' : 'UNREACHABLE'}</span>
          </div>
          <h3 className={styles.nodeName}>ESP32 Central Gateway</h3>
          <p className={styles.nodeDesc}>Living Room Hardware Access Point</p>
          <div className={styles.nodeMeta}>
            <span>AP IP: <code>192.168.4.1</code></span>
            <span>Protocol: <code>WebSocket / TCP 8080</code></span>
          </div>
        </div>

        {/* Node 4: Web Interface Client */}
        <div className={`${styles.nodeCard} ${styles.nodeHealthy}`}>
          <div className={styles.nodeHeader}>
            <Radio size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>HOST LOCAL</span>
          </div>
          <h3 className={styles.nodeName}>Web Client Node</h3>
          <p className={styles.nodeDesc}>React SPA Frontend (Localhost / LAN)</p>
          <div className={styles.nodeMeta}>
            <span>Client IP: <code>192.168.1.105</code></span>
            <span>Active Path: <strong>{networkState.mode === 'LOCAL' ? 'Direct LAN WebSocket' : 'Dual Cloud/LAN'}</strong></span>
          </div>
        </div>
      </div>

      {/* Benchmark & Ping Test Tool */}
      <div className={styles.diagnosticToolCard}>
        <div className={styles.toolHeader}>
          <div className={styles.toolTitleGroup}>
            <Server size={20} className={styles.toolIcon} />
            <div>
              <h3 className={styles.toolTitle}>Real-time Link Benchmark & Ping Probe</h3>
              <p className={styles.toolSubtitle}>Sends ICMP and WebSocket heartbeat probes to evaluate packet transmission.</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.pingButton}
            onClick={handleRunPing}
            disabled={isPinging}
          >
            <RefreshCw size={16} className={isPinging ? styles.spin : ''} />
            <span>{isPinging ? 'Probing Link...' : 'Run Ping Benchmark'}</span>
          </button>
        </div>

        {pingStatus && (
          <div className={styles.pingConsole}>
            <span className={styles.consolePrompt}>$ traceroute --smart-home-gateway</span>
            <span className={styles.consoleResult}>{pingStatus}</span>
          </div>
        )}

        <div className={styles.specsRow}>
          <div className={styles.specItem}>
            <Wifi size={16} />
            <span>Wi-Fi Signal (RSSI): <strong>-42 dBm (Excellent)</strong></span>
          </div>
          <div className={styles.specItem}>
            <ShieldCheck size={16} />
            <span>Failover Readiness: <strong>Sub-second Autonomous Switching</strong></span>
          </div>
          <div className={styles.specItem}>
            <AlertCircle size={16} />
            <span>Loss Protection: <strong>Local Command Queue Buffered</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

