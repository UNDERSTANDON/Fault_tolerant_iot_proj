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
          <span className={styles.barTitle}>FAULT INJECTION & RESEARCH EXPERIMENT PANEL</span>
        </div>
        <div className={styles.barRight}>
          <span className={styles.activeModeTag}>Active Mode: <strong>{currentMode}</strong></span>
          {isOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </div>
      </button>

      {/* Drawer Content */}
      {isOpen && (
        <div className={styles.drawerContent}>
          <div className={styles.testActions}>
            <span className={styles.actionGroupTitle}>1. Inject Fault & Safety Scenarios:</span>
            
            <div className={styles.buttonRow}>
              {/* Scenario T1: Normal */}
              <button
                type="button"
                className={`${styles.testBtn} ${currentMode === 'NORMAL' ? styles.btnActive : ''}`}
                onClick={() => onRestore()}
              >
                <ShieldCheck size={16} />
                <span>T1: Normal Mode (Full Network)</span>
              </button>

              {/* Scenario T2: Internet Down -> Local Mode */}
              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnWarning} ${currentMode === 'LOCAL' ? styles.btnActiveWarning : ''}`}
                onClick={() => onTriggerFault('INTERNET_DOWN')}
              >
                <WifiOff size={16} />
                <span>T2: Internet Lost (Fallback to Local)</span>
              </button>

              {/* Scenario T3: LAN Down -> Unavailable */}
              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnDanger} ${currentMode === 'UNAVAILABLE' ? styles.btnActiveDanger : ''}`}
                onClick={() => onTriggerFault('LAN_DOWN')}
              >
                <AlertTriangle size={16} />
                <span>T3: Complete LAN Outage (Unavailable)</span>
              </button>

              {/* Scenario T4: Recovery */}
              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnInfo}`}
                onClick={() => onTriggerFault('SIMULATE_RECOVERY')}
              >
                <RotateCcw size={16} />
                <span>T4: Reconnection Phase (Reconnecting)</span>
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
            <span className={styles.actionGroupTitle}>2. Research Evaluation Metrics:</span>
            <div className={styles.metricsGrid}>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Fallback Transition Time:</span>
                <span className={styles.metricValue}>{metrics.fallbackTimeMs} ms</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Average Command Latency:</span>
                <span className={styles.metricValue}>{metrics.avgResponseTimeMs} ms</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>Command Execution Success Rate:</span>
                <span className={styles.metricValue}>
                  {metrics.commandsTotal > 0
                    ? `${((metrics.commandsSuccess / metrics.commandsTotal) * 100).toFixed(1)}% (${metrics.commandsSuccess}/${metrics.commandsTotal})`
                    : '100% (No commands sent)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
