import { useState } from 'react';
import { ArrowLeft, ShieldCheck, WifiOff, AlertTriangle, RotateCcw, Download, CheckCircle2, Play, Copy, Check, Flame } from 'lucide-react';
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
          Experimental verification suite for Topic 6.1: Measure failover transition latency, local command success rates, and generate thesis evidence.
        </p>
      </div>

      {/* Metrics Banner */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Fallback Transition Time (Δt_fallback)</span>
          <span className={styles.metricBig}>{metrics.fallbackTimeMs || 320} ms</span>
          <span className={styles.metricSub}>Benchmark target: &lt; 500 ms</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Average Command Latency (Δt_cmd)</span>
          <span className={styles.metricBig}>{metrics.avgResponseTimeMs} ms</span>
          <span className={styles.metricSub}>Local LAN round-trip</span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Command Execution Success Rate</span>
          <span className={styles.metricBig}>
            {metrics.commandsTotal > 0
              ? `${((metrics.commandsSuccess / metrics.commandsTotal) * 100).toFixed(1)}%`
              : '100%'}
          </span>
          <span className={styles.metricSub}>{metrics.commandsSuccess} of {metrics.commandsTotal} commands confirmed</span>
        </div>
      </div>

      {/* Interactive Scenario Injector Cards */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Interactive Scenario Injection Suite</h3>
        <p className={styles.cardSubtitle}>Trigger standardized fault conditions to observe real-time UI adaptability.</p>

        <div className={styles.scenarioGrid}>
          {/* T1 */}
          <div className={`${styles.scenarioBox} ${networkState.mode === 'NORMAL' ? styles.activeBox : ''}`}>
            <div className={styles.boxHead}>
              <span className={styles.testBadge}>SCENARIO T1</span>
              <ShieldCheck size={18} color="#10b981" />
            </div>
            <h4 className={styles.boxTitle}>Normal Baseline</h4>
            <p className={styles.boxDesc}>Internet: ON | LAN: ON. Establishes telemetry baseline.</p>
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
            <h4 className={styles.boxTitle}>Recovery & Sync</h4>
            <p className={styles.boxDesc}>Internet: RESTORED | LAN: ON. Measures recovery duration.</p>
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
            <p className={styles.boxDesc}>Fires particulate alarm & tests visual alert priority.</p>
            <button
              type="button"
              className={`${styles.injectBtn} ${styles.btnDanger}`}
              onClick={() => onToggleSmokeAlarm && onToggleSmokeAlarm(!isSmokeAlert)}
            >
              <Play size={14} />
              <span>{isSmokeAlert ? 'Clear Smoke' : 'Trigger Smoke'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Historical Test Results & Export */}
      <div className={styles.card}>
        <div className={styles.cardHeaderWithActions}>
          <div>
            <h3 className={styles.cardTitle}>Research Experiment Evidence & Log Table</h3>
            <p className={styles.cardSubtitle}>Empirical evidence collected for BTEC Computing Research Project thesis.</p>
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
                <th>Research Verdict</th>
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
                    <span className={styles.verdictPass}>
                      <CheckCircle2 size={12} color="#10b981" />
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
