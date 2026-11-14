import { useState } from 'react';
import { ArrowLeft, ShieldCheck, WifiOff, AlertTriangle, RotateCcw, Download, Play, Copy, Check, Flame } from 'lucide-react';
import styles from './ResearchTestView.module.css';

export default function ResearchTestView({
  networkState,
  metrics,
  onTriggerFault,
  onRestore,
  onBackToDashboard,
  isSmokeAlert,
  onToggleSmokeAlarm,
  experimentLogs = []
}) {
  const [copied, setCopied] = useState(false);

  const handleExportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Experiment ID,Timestamp,Test Scenario,Internet,Local LAN,Expected State,Measured Latency,Outcome\n"
      + experimentLogs.map(e => `${e.id},${e.time},${e.test},${e.internet},${e.lan},${e.expected},${e.measured},${e.result}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "btec_fault_tolerant_test_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyMarkdown = () => {
    const mdTable = `| Experiment ID | Test Scenario | Internet | Local LAN | Expected State | Latency / Transition | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
` + experimentLogs.map(e => `| ${e.id} | ${e.test} | ${e.internet} | ${e.lan} | ${e.expected} | ${e.measured} | **${e.result}** |`).join("\n");

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
          title="Return to Main Dashboard"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>
        <div className={styles.screenTag}>Screen S6: Research Experiment Laboratory</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Research Fault Injection & Evaluation Laboratory</h2>
        <p className={styles.subtitle}>
          Demo-only fault scenarios and sample metrics. No live network failover, device commands, or hazard sensors are tested here.
        </p>
      </div>

      {/* Metrics Banner */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Simulated fallback transition</span>
          <span className={styles.metricBig}>{metrics.fallbackTimeMs || 320} ms</span>
          <span className={styles.metricSub}>UI timer only · not measured network latency</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Simulated toggle timing</span>
          <span className={styles.metricBig}>{metrics.avgResponseTimeMs} ms</span>
          <span className={styles.metricSub}>Demo estimate · no device command sent</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Simulated UI toggle actions</span>
          <span className={styles.metricBig}>{metrics.commandsTotal}</span>
          <span className={styles.metricSub}>Not sent to devices · no acknowledgements implemented</span>
        </div>
      </div>

      {/* Interactive Scenario Injector Cards */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Interactive Scenario Injection Suite</h3>
        <p className={styles.cardSubtitle}>These controls change dashboard demo state only; they do not interrupt or recover real services.</p>

        <div className={styles.scenarioGrid}>
          {/* T1 */}
          <div className={`${styles.scenarioBox} ${networkState.mode === 'NORMAL' ? styles.activeBox : ''}`}>
            <div className={styles.boxHead}>
              <span className={styles.testBadge}>SCENARIO T1</span>
              <ShieldCheck size={18} color="#10b981" />
            </div>
            <h4 className={styles.boxTitle}>Normal Baseline</h4>
            <p className={styles.boxDesc}>Demo state: Internet and LAN shown as on; no telemetry baseline is measured.</p>
            <button type="button" className={styles.injectBtn} onClick={onRestore}>
              <Play size={14} />
              <span>Engage Baseline</span>
            </button>
          </div>

          {/* T2 */}
          <div className={`${styles.scenarioBox} ${networkState.mode === 'LOCAL' ? styles.activeBoxLocal : ''}`}>
            <div className={styles.boxHead}>
              <span className={`${styles.testBadge} ${styles.badgeWarn}`}>SCENARIO T2</span>
              <WifiOff size={18} color="#f59e0b" />
            </div>
            <h4 className={styles.boxTitle}>Internet Down (Fallback)</h4>
            <p className={styles.boxDesc}>Internet: OFF | LAN: ON. Tests sub-second local failover.</p>
            <button
              type="button"
              className={`${styles.injectBtn} ${styles.btnWarn}`}
              onClick={() => onTriggerFault('INTERNET_DOWN')}
            >
              <Play size={14} />
              <span>Cut Internet</span>
            </button>
          </div>

          {/* T3 */}
          <div className={`${styles.scenarioBox} ${networkState.mode === 'UNAVAILABLE' ? styles.activeBoxDanger : ''}`}>
            <div className={styles.boxHead}>
              <span className={`${styles.testBadge} ${styles.badgeDanger}`}>SCENARIO T3</span>
              <AlertTriangle size={18} color="#ef4444" />
            </div>
            <h4 className={styles.boxTitle}>Total Network Outage</h4>
            <p className={styles.boxDesc}>Internet: OFF | LAN: OFF. Verifies safe locking of controls.</p>
            <button
              type="button"
              className={`${styles.injectBtn} ${styles.btnDanger}`}
              onClick={() => onTriggerFault('LAN_DOWN')}
            >
              <Play size={14} />
              <span>Cut Both Links</span>
            </button>
          </div>

          {/* T4 */}
          <div className={styles.scenarioBox}>
            <div className={styles.boxHead}>
              <span className={`${styles.testBadge} ${styles.badgeInfo}`}>SCENARIO T4</span>
              <RotateCcw size={18} color="#6366f1" />
            </div>
            <h4 className={styles.boxTitle}>Recovery scenario</h4>
            <p className={styles.boxDesc}>Changes the demo state only; no service recovery or sync duration is measured.</p>
            <button
              type="button"
              className={`${styles.injectBtn} ${styles.btnInfo}`}
              onClick={() => onTriggerFault('SIMULATE_RECOVERY')}
            >
              <Play size={14} />
              <span>Trigger Recovery</span>
            </button>
          </div>

          {/* T5: Hazard Alarm */}
          <div className={`${styles.scenarioBox} ${isSmokeAlert ? styles.activeBoxDanger : ''}`}>
            <div className={styles.boxHead}>
              <span className={`${styles.testBadge} ${styles.badgeDanger}`}>HAZARD T5</span>
              <Flame size={18} color="#ef4444" />
            </div>
            <h4 className={styles.boxTitle}>Smoke Emergency</h4>
            <p className={styles.boxDesc}>Simulates an alert display; no smoke sensor is connected.</p>
            <button
              type="button"
              className={`${styles.injectBtn} ${styles.btnDanger}`}
              onClick={() => onToggleSmokeAlarm && onToggleSmokeAlarm(!isSmokeAlert)}
            >
              <Play size={14} />
              <span>{isSmokeAlert ? 'Clear simulated alert' : 'Simulate smoke alert'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Historical Test Results & Export */}
      <div className={styles.card}>
        <div className={styles.cardHeaderWithActions}>
          <div>
            <h3 className={styles.cardTitle}>Sample scenario log · simulated</h3>
            <p className={styles.cardSubtitle}>Illustrative UI test data, not empirical network or hardware evidence.</p>
          </div>

          <div className={styles.actionButtonGroup}>
            <button type="button" className={styles.actionBtn} onClick={handleCopyMarkdown}>
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copied ? 'Copied Markdown!' : 'Copy Markdown Table'}</span>
            </button>
            <button type="button" className={`${styles.actionBtn} ${styles.btnPrimary}`} onClick={handleExportCSV}>
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Test ID</th>
                <th>Timestamp</th>
                <th>Scenario Description</th>
                <th>Internet</th>
                <th>Local LAN</th>
                <th>Expected UI State</th>
                <th>Transition Time</th>
                <th>Demo status</th>
              </tr>
            </thead>
            <tbody>
              {experimentLogs.map((item) => (
                <tr key={item.id}>
                  <td><code>{item.id}</code></td>
                  <td>{item.time}</td>
                  <td><strong>{item.test}</strong></td>
                  <td>{item.internet}</td>
                  <td>{item.lan}</td>
                  <td><span className={styles.expectedTag}>{item.expected}</span></td>
                  <td><code>{item.measured}</code></td>
                  <td>
                    <span className={styles.verdictDemo}>
                      <span>{item.result}</span>
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
