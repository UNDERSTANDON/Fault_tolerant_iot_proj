import { useState } from 'react';
import { RotateCcw, AlertTriangle, ShieldCheck, ChevronUp, ChevronDown, FlaskConical, WifiOff, Flame } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './FaultSimulation.module.css';

export default function FaultSimulation({
  currentMode,
  hardwareStatus,
  onTriggerFault,
  onRestore,
  metrics,
  isSmokeAlert,
  onToggleSmokeAlarm
}) {
  const { t, translateSource } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const sourceLabel = translateSource(hardwareStatus?.dataSource);

  return (
    <div className={`${styles.simulationContainer} ${isOpen ? styles.open : styles.collapsed}`}>
      {/* Floating Capsule Dock / Drawer Header */}
      <button
        type="button"
        className={styles.toggleBar}
        onClick={() => setIsOpen(!isOpen)}
        title={t('testLab.dockTitle')}
      >
        <div className={styles.barLeft}>
          <span className={styles.labIconPill}>
            <FlaskConical size={15} />
          </span>
          <span className={styles.barTitle}>{t('testLab.dockTitle')}</span>
          <span className={styles.sourceBadge}>{t('common.adminShort')} · {sourceLabel}</span>
        </div>
        <div className={styles.barRight}>
          <span className={styles.activeModeTag}>{t('testLab.dockMode')}: <strong>{currentMode}</strong></span>
          {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>
      </button>

      {/* Drawer Content */}
      {isOpen && (
        <div className={styles.drawerContent}>
          <div className={styles.testActions}>
            <span className={styles.actionGroupTitle}>{t('testLab.dockGroup1')}</span>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={`${styles.testBtn} ${currentMode === 'NORMAL' ? styles.btnActive : ''}`}
                onClick={() => onRestore()}
              >
                <ShieldCheck size={15} />
                <span>{t('testLab.dockT1')}</span>
              </button>

              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnWarning} ${currentMode === 'LOCAL' ? styles.btnActiveWarning : ''}`}
                onClick={() => onTriggerFault('INTERNET_DOWN')}
              >
                <WifiOff size={15} />
                <span>{t('testLab.dockT2')}</span>
              </button>

              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnDanger} ${currentMode === 'UNAVAILABLE' ? styles.btnActiveDanger : ''}`}
                onClick={() => onTriggerFault('LAN_DOWN')}
              >
                <AlertTriangle size={15} />
                <span>{t('testLab.dockT3')}</span>
              </button>

              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnInfo}`}
                onClick={() => onTriggerFault('SIMULATE_RECOVERY')}
              >
                <RotateCcw size={15} />
                <span>{t('testLab.dockT4')}</span>
              </button>

              <button
                type="button"
                className={`${styles.testBtn} ${styles.btnDanger} ${isSmokeAlert ? styles.btnActiveDanger : ''}`}
                onClick={() => onToggleSmokeAlarm && onToggleSmokeAlarm(!isSmokeAlert)}
              >
                <Flame size={15} />
                <span>{isSmokeAlert ? t('testLab.dockSmokeClear') : t('testLab.dockSmokeTrigger')}</span>
              </button>
            </div>
          </div>

          {/* Test Lab Metrics Display */}
          <div className={styles.metricsBox}>
            <span className={styles.actionGroupTitle}>{t('testLab.dockGroup2', { source: sourceLabel })}</span>
            <div className={styles.metricsGrid}>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>{t('testLab.dockFailoverTime')}</span>
                <span className={styles.metricValue}>{metrics.fallbackTimeMs} ms</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>{t('testLab.dockAvgLatency')}</span>
                <span className={styles.metricValue}>{metrics.avgResponseTimeMs} ms</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>{t('testLab.dockCommandsExecuted')}</span>
                <span className={styles.metricValue}>{metrics.commandsTotal}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
