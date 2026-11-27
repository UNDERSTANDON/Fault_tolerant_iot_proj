import { useState } from 'react';
import { ArrowLeft, RefreshCw, CheckCircle2, Clock, ArrowRight, Database } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './RecoveryView.module.css';

export default function RecoveryView({ networkState, hardwareStatus, recentActivity = [], onBackToDashboard, onTriggerSync, onResetDemo }) {
  const { t, locale, translateSource } = useLanguage();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(() => new Date().toLocaleTimeString(locale));
  const sourceLabel = translateSource(hardwareStatus?.dataSource);

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime(new Date().toLocaleTimeString(locale));
      if (onTriggerSync) onTriggerSync();
      else if (onResetDemo) onResetDemo();
    }, 700);
  };

  const resolveActivityItem = (item) => {
    const rawParams = item.params || {};
    const resolvedParams = { ...rawParams };
    if (rawParams.deviceId) {
      const translatedDev = t(`devices.${rawParams.deviceId}`);
      resolvedParams.device = translatedDev !== `devices.${rawParams.deviceId}` ? translatedDev : (rawParams.device || rawParams.deviceId);
    }
    if (rawParams.actionKey) {
      resolvedParams.action = t(rawParams.actionKey);
    }
    if (rawParams.ackKey) {
      resolvedParams.ack = t(rawParams.ackKey, resolvedParams);
    }
    const title = item.titleKey ? t(item.titleKey, resolvedParams) : item.title;
    const sub = item.subKey ? t(item.subKey, resolvedParams) : (resolvedParams.ack || item.sub);
    return { title, sub };
  };

  const liveEvents = recentActivity.filter((item) => item.time && item.time !== '--:--:--');
  const syncQueue = liveEvents.map((item, idx) => {
    const { title, sub } = resolveActivityItem(item);
    return {
      id: `q-${idx + 1}`,
      time: item.time,
      room: 'ESP32-S3',
      device: title,
      event: sub,
      status: hardwareStatus?.isLive ? t('common.online') : t('common.standby')
    };
  });

  const isReconnecting = networkState?.mode === 'RECONNECTING';

  return (
    <div className={styles.container}>
      {/* Navigation Header */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
        >
          <ArrowLeft size={18} />
          <span>{t('common.backToOverview')}</span>
        </button>
        <div className={styles.screenTag}>{t('recovery.screenTag')} · {t('common.source')}: {sourceLabel}</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>{t('recovery.title')}</h2>
        <p className={styles.subtitle}>{t('recovery.subtitle')}</p>
      </div>

      {/* Sync Status Banner */}
      <div className={`${styles.statusCard} ${isReconnecting ? styles.statusReconnecting : styles.statusSynced}`}>
        <div className={styles.statusLeft}>
          <div className={styles.statusIcon}>
            {isReconnecting ? <RefreshCw size={26} className={styles.spin} /> : <CheckCircle2 size={26} />}
          </div>
          <div>
            <h3 className={styles.statusTitle}>
              {isReconnecting ? t('recovery.reconnectingTitle') : t('recovery.syncedTitle')}
            </h3>
            <p className={styles.statusDesc}>
              {isReconnecting ? t('recovery.reconnectingDesc') : t('recovery.syncedDesc')}
            </p>
          </div>
        </div>

        <button
          type="button"
          className={styles.syncButton}
          onClick={handleManualSync}
          disabled={isSyncing}
        >
          <RefreshCw size={16} className={isSyncing ? styles.spin : ''} />
          <span>{isSyncing ? t('recovery.syncingBtn') : t('recovery.triggerSyncBtn')}</span>
        </button>
      </div>

      {/* 3-Step Pipeline Flow */}
      <div className={styles.pipelineGrid}>
        <div className={styles.stepCard}>
          <span className={styles.stepBadge}>STEP 01</span>
          <h4 className={styles.stepTitle}>{t('recovery.step1Title')}</h4>
          <p className={styles.stepDesc}>{t('recovery.step1Desc')}</p>
          <div className={styles.stepFooter}>
            <ArrowRight size={14} />
            <span>NVS &amp; RAM Outbox</span>
          </div>
        </div>

        <div className={styles.stepCard}>
          <span className={styles.stepBadge}>STEP 02</span>
          <h4 className={styles.stepTitle}>{t('recovery.step2Title')}</h4>
          <p className={styles.stepDesc}>{t('recovery.step2Desc')}</p>
          <div className={styles.stepFooter}>
            <ArrowRight size={14} />
            <span>TLS :8883 / WSS :8084</span>
          </div>
        </div>

        <div className={styles.stepCard}>
          <span className={styles.stepBadge}>STEP 03</span>
          <h4 className={styles.stepTitle}>{t('recovery.step3Title')}</h4>
          <p className={styles.stepDesc}>{t('recovery.step3Desc')}</p>
          <div className={styles.stepFooter}>
            <CheckCircle2 size={14} color="#10b981" />
            <span>QoS 1 Ack Verified</span>
          </div>
        </div>
      </div>

      {/* Synchronized Telemetry Queue Table */}
      <div className={styles.queueCard}>
        <div className={styles.queueHeader}>
          <div className={styles.queueTitleGroup}>
            <Database size={20} className={styles.queueIcon} />
            <div>
              <h3 className={styles.queueTitle}>{t('recovery.queueTitle')}</h3>
              <p className={styles.queueSubtitle}>{t('recovery.queueSubtitle')} · {t('common.source')}: {sourceLabel}</p>
            </div>
          </div>
          <div className={styles.queueMeta}>
            <Clock size={14} />
            <span>{t('recovery.lastSync')}: <strong>{lastSyncTime}</strong></span>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('recovery.colQueueId')}</th>
                <th>{t('recovery.colTimestamp')}</th>
                <th>{t('recovery.colZone')}</th>
                <th>{t('recovery.colTarget')}</th>
                <th>{t('recovery.colPayload')}</th>
                <th>{t('recovery.colSyncStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {syncQueue.length > 0 ? (
                syncQueue.map((item) => (
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
                ))
              ) : (
                <tr>
                  <td colSpan={6}>{t('recovery.emptyQueue')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
