import { Lightbulb, Fan, Lock, Network, ArrowRight, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './DashboardBottomRow.module.css';

export default function DashboardBottomRow({ networkMode, onNavigateToConnections, recentActivity = [] }) {
  const { t } = useLanguage();
  const isLocal = networkMode === 'LOCAL';

  const getActivityIcon = (type) => {
    switch (type) {
      case 'fan':
        return <Fan size={16} />;
      case 'lock':
        return <Lock size={16} />;
      case 'network':
        return <Network size={16} />;
      case 'light':
      default:
        return <Lightbulb size={16} />;
    }
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

  return (
    <div className={styles.bottomGrid}>
      {/* 1. Dynamic Recent Activity Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{t('dashboard.recentActivity')}</h3>
          <span className={styles.badgeConfirmed}>{t('dashboard.eventLogActive')}</span>
        </div>

        <div className={styles.activityList}>
          {recentActivity.slice(0, 4).map((item) => {
            const { title, sub } = resolveActivityItem(item);
            return (
              <div key={item.id} className={styles.activityItem}>
                <div className={styles.itemIconCircle}>
                  {getActivityIcon(item.type)}
                </div>
                <div className={styles.itemMeta}>
                  <span className={styles.itemTitle}>{title}</span>
                  <span className={styles.itemSub}>{sub}</span>
                </div>
                <span className={styles.itemTime}>{item.time}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Local Connection First Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.titleWithIcon}>
            <ShieldCheck size={18} color="var(--accent-primary)" />
            <h3 className={styles.cardTitle}>
              {isLocal ? t('dashboard.localControlActive') : t('dashboard.localFirstResilience')}
            </h3>
          </div>
        </div>

        <div className={styles.flowDiagram}>
          <span className={styles.flowPill}>SafeHaven UI</span>
          <ArrowRight size={14} color="var(--text-secondary)" />
          <span className={styles.flowPill}>Local LAN</span>
          <ArrowRight size={14} color="var(--text-secondary)" />
          <span className={styles.flowPill}>ESP32-S3</span>
        </div>

        <p className={styles.cardDesc}>
          {isLocal ? t('dashboard.localDescActive') : t('dashboard.localDescNormal')}
        </p>

        <div className={styles.cardDivider}></div>

        {onNavigateToConnections && (
          <button
            type="button"
            className={styles.statusLink}
            onClick={onNavigateToConnections}
          >
            <span>{t('dashboard.viewDiagnostics')}</span>
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
