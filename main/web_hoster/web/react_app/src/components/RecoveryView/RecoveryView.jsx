import { useState } from 'react';
import { ArrowLeft, RefreshCw, CheckCircle2, Clock, ArrowRight, Database } from 'lucide-react';
import styles from './RecoveryView.module.css';

export default function RecoveryView({ networkState, onBackToDashboard, onTriggerSync }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString('en-US'));

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime(new Date().toLocaleTimeString('en-US'));
      if (onTriggerSync) onTriggerSync();
    }, 700);
  };

  const syncQueue = [
    { id: 'q-1', time: '21:05:12', room: 'Living Room', device: 'Ceiling Light', event: 'State -> ON (Local LAN)', status: 'SYNCHRONIZED' },
    { id: 'q-2', time: '21:06:40', room: 'Kitchen', device: 'Kitchen Temp', event: 'Telemetry 29.8°C recorded', status: 'SYNCHRONIZED' },
    { id: 'q-3', time: '21:08:15', room: 'Living Room', device: 'Ventilation Fan', event: 'State -> OFF (Local LAN)', status: 'SYNCHRONIZED' },
    { id: 'q-4', time: '21:10:02', room: 'Hallway', device: 'NFC Door Lock', event: 'Status Verified LOCKED', status: 'SYNCHRONIZED' }
  ];

  const isReconnecting = networkState.mode === 'RECONNECTING';

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
        <div className={styles.screenTag}>Screen S5: Cloud Reconnection & Sync</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Cloud Synchronization & Recovery Pipeline</h2>
        <p className={styles.subtitle}>
          Post-outage state reconciliation: Flushes buffered local commands and telemetry back to the cloud broker.
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
                ? 'Internet connection detected. Harmonizing offline local sensor history with remote cloud service.'
                : 'All local domestic events have been committed to the remote ledger. Client and Cloud states are identical.'}
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
              <span>DNS & Gateway reachability verified</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} />
          </div>

          <div className={`${styles.stepItem} ${styles.stepComplete}`}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepInfo}>
              <strong>Buffer Lock</strong>
              <span>Local queue frozen for atomic commit</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} />
          </div>

          <div className={`${styles.stepItem} ${styles.stepComplete}`}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepInfo}>
              <strong>Batch Telemetry Upload</strong>
              <span>Buffered readings published to MQTT</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} />
          </div>

          <div className={`${styles.stepItem} ${styles.stepComplete}`}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.stepInfo}>
              <strong>Switch to Normal</strong>
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
              <p className={styles.queueSubtitle}>Events recorded autonomously during local fallback execution.</p>
            </div>
          </div>
          <div className={styles.queueMeta}>
            <Clock size={14} />
            <span>Last Sync Timestamp: <strong>{lastSyncTime}</strong></span>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Queue ID</th>
                <th>Local Timestamp</th>
                <th>Zone</th>
                <th>Device Target</th>
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
