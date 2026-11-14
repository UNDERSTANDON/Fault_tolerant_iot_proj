import { useState } from 'react';
import { ArrowLeft, RefreshCw, Clock, ArrowRight, Database } from 'lucide-react';
import styles from './RecoveryView.module.css';

export default function RecoveryView({ networkState, onBackToDashboard, onResetDemo }) {
  const [isResetting, setIsResetting] = useState(false);
  const [lastDemoActionTime, setLastDemoActionTime] = useState(null);

  const handleResetDemo = () => {
    setIsResetting(true);
    setTimeout(() => {
      setIsResetting(false);
      setLastDemoActionTime(new Date().toLocaleTimeString('en-US'));
      if (onResetDemo) onResetDemo();
    }, 700);
  };

  const sampleEvents = [
    { id: 'sample-1', time: '—', room: 'Living Room', device: 'Ceiling Light', event: 'Illustrative state change', status: 'SAMPLE ONLY' },
    { id: 'sample-2', time: '—', room: 'Kitchen', device: 'Temperature', event: 'Illustrative sensor value', status: 'SAMPLE ONLY' },
    { id: 'sample-3', time: '—', room: 'Living Room', device: 'Ventilation Fan', event: 'Illustrative state change', status: 'SAMPLE ONLY' },
    { id: 'sample-4', time: '—', room: 'Hallway', device: 'Door lock', event: 'Illustrative device state', status: 'SAMPLE ONLY' }
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
        <div className={styles.screenTag}>Simulated recovery scenario</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Recovery scenario · demo only</h2>
        <p className={styles.subtitle}>
          No cloud service, persistent queue, or telemetry replay is connected. This screen only demonstrates UI states.
        </p>
      </div>

      {/* Sync Status Banner */}
      <div className={`${styles.statusCard} ${isReconnecting ? styles.statusReconnecting : styles.statusDemo}`}>
        <div className={styles.statusLeft}>
          <div className={styles.statusIcon}>
            {isReconnecting ? <RefreshCw size={26} className={styles.spin} /> : <Clock size={26} />}
          </div>
          <div>
            <h3 className={styles.statusTitle}>
              {isReconnecting ? 'SIMULATED RECOVERY STATE' : 'SIMULATED BASELINE'}
            </h3>
            <p className={styles.statusDesc}>
              {isReconnecting
                ? 'The demo is showing a recovery state; no connection or data replay is occurring.'
                : 'This is a demo state. No events have been uploaded or synchronized.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className={styles.syncBtn}
          onClick={handleResetDemo}
          disabled={isResetting}
        >
          <RefreshCw size={16} className={isResetting ? styles.spin : ''} />
          <span>{isResetting ? 'Resetting demo...' : 'Reset demo baseline'}</span>
        </button>
      </div>

      {/* 4-Step Recovery Pipeline */}
      <div className={styles.pipelineCard}>
        <h3 className={styles.pipelineTitle}>Illustrative recovery flow · not implemented</h3>
        <div className={styles.pipelineSteps}>
          <div className={styles.stepItem}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepInfo}>
              <strong>Carrier handshake</strong>
              <span>Planned · not verified</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} aria-hidden="true" />
          </div>

          <div className={styles.stepItem}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepInfo}>
              <strong>Buffer lock</strong>
              <span>Planned · no queue exists</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} aria-hidden="true" />
          </div>

          <div className={styles.stepItem}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepInfo}>
              <strong>Telemetry upload</strong>
              <span>Planned · no sensor telemetry is connected</span>
            </div>
            <ArrowRight size={16} className={styles.arrowIcon} aria-hidden="true" />
          </div>

          <div className={styles.stepItem}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.stepInfo}>
              <strong>Return to normal</strong>
              <span>Planned · no cloud or LAN route is changed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Illustrative, non-persistent sample data */}
      <div className={styles.queueCard}>
        <div className={styles.queueHeader}>
          <div className={styles.queueTitleGroup}>
            <Database size={20} className={styles.queueIcon} />
            <div>
              <h3 className={styles.queueTitle}>Sample event list · not a real queue</h3>
              <p className={styles.queueSubtitle}>Illustrative rows only; no events are stored, replayed, or synchronized.</p>
            </div>
          </div>
          <div className={styles.queueMeta}>
            <Clock size={14} />
            <span>Last demo action: <strong>{lastDemoActionTime || 'None'}</strong></span>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Sample ID</th>
                <th>Timestamp</th>
                <th>Zone</th>
                <th>Device Target</th>
                <th>Event Payload</th>
                <th>Data status</th>
              </tr>
            </thead>
            <tbody>
              {sampleEvents.map((item) => (
                <tr key={item.id}>
                  <td><code>{item.id}</code></td>
                  <td>{item.time}</td>
                  <td><strong>{item.room}</strong></td>
                  <td>{item.device}</td>
                  <td><span className={styles.payloadTag}>{item.event}</span></td>
                  <td>
                    <span className={styles.sampleBadge}>
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
