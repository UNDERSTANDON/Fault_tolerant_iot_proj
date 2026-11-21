import { useState } from 'react';
import { ArrowLeft, RefreshCw, CheckCircle2, Clock, ArrowRight, Database } from 'lucide-react';
import styles from './RecoveryView.module.css';

export default function RecoveryView({ networkState, onBackToDashboard, onTriggerSync, onResetDemo }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString('en-US'));

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime(new Date().toLocaleTimeString('en-US'));
      if (onTriggerSync) onTriggerSync();
      else if (onResetDemo) onResetDemo();
    }, 700);
  };

  const syncQueue = [
    { id: 'q-101', time: '21:05:12', room: 'Living Room', device: 'Ceiling Light (Relay CH2)', event: 'State -> ON (Local LAN)', status: 'SYNCHRONIZED' },
    { id: 'q-102', time: '21:06:40', room: 'Kitchen', device: 'Kitchen Temperature (DHT22)', event: 'Telemetry 29.8°C recorded', status: 'SYNCHRONIZED' },
    { id: 'q-103', time: '21:08:15', room: 'Living Room', device: 'Ventilation Fan (Relay CH3)', event: 'State -> OFF (Local LAN)', status: 'SYNCHRONIZED' },
    { id: 'q-104', time: '21:10:02', room: 'Hallway & Entrance', device: 'NFC Door Lock (PN532)', event: 'Status Verified LOCKED', status: 'SYNCHRONIZED' }
  ];

  const isReconnecting = networkState?.mode === 'RECONNECTING';

  return (
    <div className={styles.container}>
      {/* Navigation Header */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
          title="Return to Home Overview"
        >
          <ArrowLeft size={18} />
          <span>Back to Overview</span>
        </button>
        <div className={styles.screenTag}>Screen S5: Cloud Reconnection &amp; Sync · Source: Simulator</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Cloud Synchronization &amp; Recovery Pipeline</h2>
        <p className={styles.subtitle}>
          Post-outage state reconciliation: flushes buffered local commands and sensor telemetry back to cloud storage.
        </p>
      </div>

      {/* Sync Status Banner */}
      <div className={`${styles.statusCard} ${isReconnecting ? styles.statusReconnecting : styles.statusSynced}`}>
        <div className={styles.statusLeft}>
          <div className={styles.statusIcon}>
            {isReconnecting ? <RefreshCw size={26} className={styles.spin} /> : <CheckCircle2 size={26} />}
          </div>
          <div>
            <h3 className={styles.statusTitle}>
              {isReconnecting ? 'RECONNECTING & REPLAYING LOCAL BUFFER...' : 'CLOUD RECOVERY & TELEMETRY IN SYNC'}
            </h3>
            <p className={styles.statusDesc}>
              {isReconnecting
                ? 'External link restored. Replaying offline local sensor history with idempotent sequence IDs.'
                : 'All domestic events buffered during local fallback are synchronized with the cloud ledger.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className={styles.syncBtn}
          onClick={handleManualSync}
          disabled={isSyncing}
        >
          <RefreshCw size={16} className={isSyncing ? styles.spin : ''} />
          <span>{isSyncing ? 'Synchronizing...' : 'Trigger Cloud Sync'}</span>
        </button>
      </div>

      {/* 4-Step Recovery Pipeline */}
      <div className={styles.pipelineCard}>
        <h3 className={styles.pipelineTitle}>Automated 4-Step Failback Protocol</h3>
        <div className={styles.pipelineSteps}>
          <div className={`${styles.stepItem} ${styles.stepComplete}`}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepInfo}>
              <strong>Carrier Handshake</strong>
              <span>Gateway &amp; broker reachability verified</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} aria-hidden="true" />
          </div>

          <div className={`${styles.stepItem} ${styles.stepComplete}`}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepInfo}>
              <strong>Buffer Snapshot</strong>
              <span>Local circular ring buffer locked for commit</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} aria-hidden="true" />
          </div>

          <div className={`${styles.stepItem} ${styles.stepComplete}`}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepInfo}>
              <strong>Batch Telemetry Upload</strong>
              <span>Ordered replay with monotonic sequence IDs</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} aria-hidden="true" />
          </div>

          <div className={`${styles.stepItem} ${styles.stepComplete}`}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.stepInfo}>
              <strong>Normal Mode Restored</strong>
              <span>Dual Cloud/LAN routing re-engaged</span>
            </div>
          </div>
        </div>
      </div>

      {/* Synchronized Telemetry Queue Table */}
      <div className={styles.queueCard}>
        <div className={styles.queueHeader}>
          <div className={styles.queueTitleGroup}>
            <Database size={20} className={styles.queueIcon} />
            <div>
              <h3 className={styles.queueTitle}>Local Buffer Replay Log</h3>
              <p className={styles.queueSubtitle}>Events recorded during local fallback execution · Source: Simulator</p>
            </div>
          </div>
          <div className={styles.queueMeta}>
            <Clock size={14} />
            <span>Last Sync: <strong>{lastSyncTime}</strong></span>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Queue ID</th>
                <th>Local Timestamp</th>
                <th>Zone</th>
                <th>Device / Sensor Target</th>
                <th>Event Payload</th>
                <th>Sync Status</th>
              </tr>
            </thead>
            <tbody>
              {syncQueue.map((item) => (
                <tr key={item.id}>
                  <td><code>{item.id}</code></td>
                  <td>{item.time}</td>
                  <td><strong>{item.room}</strong></td>
                  <td>{item.device}</td>
                  <td><span className={styles.payloadTag}>{item.event}</span></td>
                  <td>
                    <span className={styles.syncBadge}>
                      <CheckCircle2 size={12} color="#10b981" />
                      <span>{item.status}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
