import { useState } from 'react';
import { RotateCcw, AlertTriangle, ShieldCheck, ChevronUp, ChevronDown, Activity, WifiOff, Flame } from 'lucide-react';
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
      {/* Toggle Button Bar */}
      <button
        type="button"
        className={styles.toggleBar}
        onClick={() => setIsOpen(!isOpen)}
        title="Toggle Fault-Tolerant Research Experiment Panel (Topic 6.1)"
      >
        <div className={styles.barLeft}>
          <Activity size={18} className={styles.pulseIcon} />
          <span className={styles.barTitle}>SIMULATED FAULT & RESEARCH DEMO</span>
        </div>
        <div className={styles.barRight}>
          <span className={styles.activeModeTag}>Demo state: <strong>{currentMode}</strong></span>
          {isOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </div>
      </button>

      {/* Drawer Content */}
      {isOpen && (
        <div className={styles.drawerContent}>
          <div className={styles.testActions}>
            <span className={styles.actionGroupTitle}>1. Simulate network and alert scenarios (UI only):</span>
            
            <div className={styles.buttonRow}>
              {/* Scenario T1: Normal */}
              <button
                type="button"
                className={`${styles.testBtn} ${currentMode === 'NORMAL' ? styles.btnActive : ''}`}
                onClick={() => onRestore()}
              >
                <ShieldCheck size={16} />
                <span>T1: Simulate Normal Mode</span>
              </button>

              {/* Scenario T2: Internet Down -> Local Mode */}
              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnWarning} ${currentMode === 'LOCAL' ? styles.btnActiveWarning : ''}`}
                onClick={() => onTriggerFault('INTERNET_DOWN')}
              >
                <WifiOff size={16} />
                <span>T2: Simulate Internet Loss</span>
              </button>

              {/* Scenario T3: LAN Down -> Unavailable */}
              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnDanger} ${currentMode === 'UNAVAILABLE' ? styles.btnActiveDanger : ''}`}
                onClick={() => onTriggerFault('LAN_DOWN')}
              >
                <AlertTriangle size={16} />
                <span>T3: Simulate Network Outage</span>
              </button>

              {/* Scenario T4: Recovery */}
              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnInfo}`}
                onClick={() => onTriggerFault('SIMULATE_RECOVERY')}
              >
                <RotateCcw size={16} />
                <span>T4: Simulate Recovery</span>
              </button>

              {/* Hazard Simulation: Smoke Alarm */}
              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnDanger} ${isSmokeAlert ? styles.btnActiveDanger : ''}`}
                onClick={() => onToggleSmokeAlarm && onToggleSmokeAlarm(!isSmokeAlert)}
              >
                <Flame size={16} />
                <span>{isSmokeAlert ? 'Clear Smoke Alarm' : 'Simulate Smoke Hazard'}</span>
              </button>
            </div>
          </div>

          {/* Research Metrics Display */}
          <div className={styles.metricsBox}>
            <span className={styles.actionGroupTitle}>2. Simulated demo metrics:</span>
            <div className={styles.metricsGrid}>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Simulated UI transition:</span>
                <span className={styles.metricValue}>{metrics.fallbackTimeMs} ms</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Simulated toggle timing:</span>
                <span className={styles.metricValue}>{metrics.avgResponseTimeMs} ms</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>UI toggle actions (not device commands):</span>
                <span className={styles.metricValue}>
                  {metrics.commandsTotal}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
