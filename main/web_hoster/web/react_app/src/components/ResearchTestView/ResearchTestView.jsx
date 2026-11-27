import { useState } from 'react';
import { ArrowLeft, ShieldCheck, WifiOff, AlertTriangle, RotateCcw, Download, CheckCircle2, Play, Copy, Check, Flame } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './ResearchTestView.module.css';

export default function ResearchTestView({
  networkState,
  hardwareStatus,
  metrics,
  onTriggerFault,
  onRestore,
  onBackToDashboard,
  isSmokeAlert,
  onToggleSmokeAlarm,
  experimentLogs = []
}) {
  const { t, translateSource } = useLanguage();
  const [copied, setCopied] = useState(false);
  const sourceLabel = translateSource(hardwareStatus?.dataSource);

  const sanitizeCsvCell = (value) => {
    const str = String(value ?? '');
    const safeFormula = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return `"${safeFormula.replace(/"/g, '""')}"`;
  };

  const handleExportCSV = () => {
    const headers = ['Experiment ID', 'Timestamp', 'Test Scenario', 'Internet', 'Local LAN', 'Expected State', 'Measured Latency', 'Outcome'];
    const rows = experimentLogs.map((e) => [
      e.id,
      e.time,
      e.testKey ? t(e.testKey) : e.test,
      e.internet,
      e.lan,
      e.expected,
      e.measured,
      sourceLabel
    ].map(sanitizeCsvCell).join(','));

    const csvText = [headers.map(sanitizeCsvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'safehaven_resilience_test_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = () => {
    const mdTable = `| Experiment ID | Test Scenario | Internet | Local LAN | Expected State | Latency / Transition | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
` + experimentLogs.map((e) => `| ${e.id} | ${e.test} | ${e.internet} | ${e.lan} | ${e.expected} | ${e.measured} | **${e.result}** |`).join('\n');

    navigator.clipboard.writeText(mdTable).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={styles.container}>
      {/* Header Navigation */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
        >
          <ArrowLeft size={18} />
          <span>{t('common.backToOverview')}</span>
        </button>
        <div className={styles.screenTag}>{t('testLab.screenTag')} · {t('common.source')}: {sourceLabel}</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>{t('testLab.title')}</h2>
        <p className={styles.subtitle}>{t('testLab.subtitle')}</p>
      </div>

      {/* Metrics Banner */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>{t('testLab.metricFallback')}</span>
          <span className={styles.metricBig}>{metrics.fallbackTimeMs} ms</span>
          <span className={styles.metricSub}>{t('testLab.metricFallbackSub')} · {t('common.source')}: {sourceLabel}</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>{t('testLab.metricLatency')}</span>
          <span className={styles.metricBig}>{metrics.avgResponseTimeMs} ms</span>
          <span className={styles.metricSub}>{t('testLab.metricLatencySub')} · {t('common.source')}: {sourceLabel}</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>{t('testLab.metricCount')}</span>
          <span className={styles.metricBig}>{metrics.commandsTotal}</span>
          <span className={styles.metricSub}>{t('testLab.metricCountSub')} · {t('common.source')}: {sourceLabel}</span>
        </div>
      </div>

      {/* Interactive Scenario Injector Cards */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{t('testLab.suiteTitle')}</h3>
        <p className={styles.cardSubtitle}>{t('testLab.suiteSubtitle')}</p>

        <div className={styles.scenarioGrid}>
          {/* T1 */}
          <div className={`${styles.scenarioBox} ${networkState.mode === 'NORMAL' ? styles.activeBox : ''}`}>
            <div className={styles.boxHead}>
              <span className={styles.testBadge}>SCENARIO T1</span>
              <ShieldCheck size={18} color="#10b981" />
            </div>
            <h4 className={styles.boxTitle}>{t('testLab.t1Title')}</h4>
            <p className={styles.boxDesc}>{t('testLab.t1Desc')}</p>
            <button type="button" className={styles.injectBtn} onClick={onRestore}>
              <Play size={14} />
              <span>{t('testLab.t1Btn')}</span>
            </button>
          </div>

          {/* T2 */}
          <div className={`${styles.scenarioBox} ${networkState.mode === 'LOCAL' ? styles.activeBoxLocal : ''}`}>
            <div className={styles.boxHead}>
              <span className={`${styles.testBadge} ${styles.badgeWarn}`}>SCENARIO T2</span>
              <WifiOff size={18} color="#f59e0b" />
            </div>
            <h4 className={styles.boxTitle}>{t('testLab.t2Title')}</h4>
            <p className={styles.boxDesc}>{t('testLab.t2Desc')}</p>
            <button type="button" className={`${styles.injectBtn} ${styles.btnWarn}`} onClick={() => onTriggerFault('INTERNET_DOWN')}>
              <Play size={14} />
              <span>{t('testLab.t2Btn')}</span>
            </button>
          </div>

          {/* T3 */}
          <div className={`${styles.scenarioBox} ${networkState.mode === 'UNAVAILABLE' ? styles.activeBoxDanger : ''}`}>
            <div className={styles.boxHead}>
              <span className={`${styles.testBadge} ${styles.badgeDanger}`}>SCENARIO T3</span>
              <AlertTriangle size={18} color="#ef4444" />
            </div>
            <h4 className={styles.boxTitle}>{t('testLab.t3Title')}</h4>
            <p className={styles.boxDesc}>{t('testLab.t3Desc')}</p>
            <button type="button" className={`${styles.injectBtn} ${styles.btnDanger}`} onClick={() => onTriggerFault('LAN_DOWN')}>
              <Play size={14} />
              <span>{t('testLab.t3Btn')}</span>
            </button>
          </div>

          {/* T4 */}
          <div className={styles.scenarioBox}>
            <div className={styles.boxHead}>
              <span className={`${styles.testBadge} ${styles.badgeInfo}`}>SCENARIO T4</span>
              <RotateCcw size={18} color="#3b82f6" />
            </div>
            <h4 className={styles.boxTitle}>{t('testLab.t4Title')}</h4>
            <p className={styles.boxDesc}>{t('testLab.t4Desc')}</p>
            <button type="button" className={`${styles.injectBtn} ${styles.btnInfo}`} onClick={() => onTriggerFault('SIMULATE_RECOVERY')}>
              <Play size={14} />
              <span>{t('testLab.t4Btn')}</span>
            </button>
          </div>

          {/* T5: Smoke Hazard */}
          <div className={`${styles.scenarioBox} ${isSmokeAlert ? styles.activeBoxDanger : ''}`}>
            <div className={styles.boxHead}>
              <span className={`${styles.testBadge} ${styles.badgeDanger}`}>SCENARIO T5</span>
              <Flame size={18} color="#ef4444" />
            </div>
            <h4 className={styles.boxTitle}>{t('testLab.t5Title')}</h4>
            <p className={styles.boxDesc}>{t('testLab.t5Desc')}</p>
            <button
              type="button"
              className={`${styles.injectBtn} ${styles.btnDanger}`}
              onClick={() => onToggleSmokeAlarm && onToggleSmokeAlarm(!isSmokeAlert)}
            >
              <Play size={14} />
              <span>{isSmokeAlert ? t('testLab.t5BtnClear') : t('testLab.t5BtnTrigger')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Historical Test Results & Export */}
      <div className={styles.card}>
        <div className={styles.cardHeaderWithActions}>
          <div>
            <h3 className={styles.cardTitle}>{t('testLab.logTitle')}</h3>
            <p className={styles.cardSubtitle}>{t('testLab.logSubtitle')} · {t('common.source')}: {sourceLabel}</p>
          </div>

          <div className={styles.actionButtonGroup}>
            <button type="button" className={styles.actionBtn} onClick={handleCopyMarkdown}>
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copied ? t('testLab.copiedMdBtn') : t('testLab.copyMdBtn')}</span>
            </button>
            <button type="button" className={`${styles.actionBtn} ${styles.btnPrimary}`} onClick={handleExportCSV}>
              <Download size={14} />
              <span>{t('testLab.exportCsvBtn')}</span>
            </button>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('testLab.colTestId')}</th>
                <th>{t('testLab.colTime')}</th>
                <th>{t('testLab.colScenario')}</th>
                <th>{t('testLab.colInternet')}</th>
                <th>{t('testLab.colLan')}</th>
                <th>{t('testLab.colExpected')}</th>
                <th>{t('testLab.colTransition')}</th>
                <th>{t('testLab.colResult')}</th>
              </tr>
            </thead>
            <tbody>
              {experimentLogs.length > 0 ? (
                experimentLogs.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.id}</code></td>
                    <td>{item.time}</td>
                    <td><strong>{item.testKey ? t(item.testKey) : item.test}</strong></td>
                    <td>{item.internet}</td>
                    <td>{item.lan}</td>
                    <td><span className={styles.expectedTag}>{item.expected}</span></td>
                    <td><code>{item.measured}</code></td>
                    <td>
                      <span className={styles.verdictPass}>
                        <CheckCircle2 size={12} color="#10b981" />
                        <span>{sourceLabel}</span>
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>{t('common.noData')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
