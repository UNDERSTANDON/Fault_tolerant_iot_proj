import { useState } from 'react';
import { RotateCcw, AlertTriangle, ShieldCheck, ChevronUp, ChevronDown, FlaskConical, WifiOff, Flame } from 'lucide-react';
import styles from './FaultSimulation.module.css';

export default function FaultSimulation({
  currentMode,
  onTriggerFault,
  onRestore,
  metrics,
  isSmokeAlert,
  onToggleSmokeAlarm
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`${styles.simulationContainer} ${isOpen ? styles.open : styles.collapsed}`}>
      {/* Floating Capsule Dock / Drawer Header */}
      <button
        type="button"
        className={styles.toggleBar}
        onClick={() => setIsOpen(!isOpen)}
        title="Toggle SafeHaven Resilience Test Lab (Administrator Only)"
      >
        <div className={styles.barLeft}>
          <span className={styles.labIconPill}>
            <FlaskConical size={15} />
          </span>
          <span className={styles.barTitle}>Resilience Test Lab</span>
          <span className={styles.sourceBadge}>Admin · Simulator</span>
        </div>
        <div className={styles.barRight}>
          <span className={styles.activeModeTag}>Mode: <strong>{currentMode}</strong></span>
          {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>
      </button>

      {/* Drawer Content */}
      {isOpen && (
        <div className={styles.drawerContent}>
          <div className={styles.testActions}>
            <span className={styles.actionGroupTitle}>1. Trigger Network &amp; Safety Test Scenarios:</span>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={`${styles.testBtn} ${currentMode === 'NORMAL' ? styles.btnActive : ''}`}
                onClick={() => onRestore()}
              >
                <ShieldCheck size={15} />
                <span>T1: Normal Mode</span>
              </button>

              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnWarning} ${currentMode === 'LOCAL' ? styles.btnActiveWarning : ''}`}
                onClick={() => onTriggerFault('INTERNET_DOWN')}
              >
                <WifiOff size={15} />
                <span>T2: Internet Lost (LAN Fallback)</span>
              </button>

              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnDanger} ${currentMode === 'UNAVAILABLE' ? styles.btnActiveDanger : ''}`}
                onClick={() => onTriggerFault('LAN_DOWN')}
              >
                <AlertTriangle size={15} />
                <span>T3: Complete LAN Outage</span>
              </button>

              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnInfo}`}
                onClick={() => onTriggerFault('SIMULATE_RECOVERY')}
              >
                <RotateCcw size={15} />
                <span>T4: Cloud Reconnection</span>
              </button>

              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnDanger} ${isSmokeAlert ? styles.btnActiveDanger : ''}`}
                onClick={() => onToggleSmokeAlarm && onToggleSmokeAlarm(!isSmokeAlert)}
              >
                <Flame size={15} />
                <span>{isSmokeAlert ? 'Clear MQ-2 Smoke Alert' : 'Trigger MQ-2 Smoke Alert'}</span>
              </button>
            </div>
          </div>

          {/* Test Lab Metrics Display */}
          <div className={styles.metricsBox}>
            <span className={styles.actionGroupTitle}>2. Test Lab Telemetry Metrics (Source: Simulator):</span>
            <div className={styles.metricsGrid}>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Failover Transition Time</span>
                <span className={styles.metricValue}>{metrics.fallbackTimeMs} ms</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Avg Command Latency</span>
                <span className={styles.metricValue}>{metrics.avgResponseTimeMs} ms</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Session Actions Executed</span>
                <span className={styles.metricValue}>{metrics.commandsTotal}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
