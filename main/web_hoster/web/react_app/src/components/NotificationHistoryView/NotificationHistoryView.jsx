import { useState, useEffect } from 'react';
import {
  Bell,
  Database,
  Clock,
  Trash2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Cloud,
  HardDrive,
  KeyRound
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './NotificationHistoryView.module.css';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * ONE_DAY_MS;

export default function NotificationHistoryView({
  notificationHistory = [],
  historyMeta = {},
  isVisitor = false,
  onDeleteItem,
  onClearAll,
  onRunCleanup
}) {
  const { t, locale, translateSource } = useLanguage();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [isBusy, setIsBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const resolveParams = (rawParams = {}) => {
    const resolved = { ...rawParams };
    if (rawParams.deviceId) {
      const translatedDevice = t(`devices.${rawParams.deviceId}`);
      resolved.device = translatedDevice !== `devices.${rawParams.deviceId}`
        ? translatedDevice
        : (rawParams.device || rawParams.deviceId);
    }
    if (rawParams.actionKey) {
      resolved.action = t(rawParams.actionKey);
    }
    if (rawParams.ackKey) {
      resolved.ack = t(rawParams.ackKey, resolved);
    }
    if (rawParams.themeKey) {
      resolved.theme = t(rawParams.themeKey);
    }
    return resolved;
  };

  const getCategoryGroup = (item) => {
    if (item.category === 'hazard') return 'HAZARD';
    if (item.category === 'device') return 'DEVICE';
    return 'NETWORK';
  };

  const hazardCount = notificationHistory.filter((item) => getCategoryGroup(item) === 'HAZARD').length;
  const deviceCount = notificationHistory.filter((item) => getCategoryGroup(item) === 'DEVICE').length;
  const networkCount = notificationHistory.filter((item) => getCategoryGroup(item) === 'NETWORK').length;

  const filteredItems = notificationHistory.filter((item) => {
    if (activeFilter === 'ALL') return true;
    return getCategoryGroup(item) === activeFilter;
  });

  const getCategoryLabel = (item) => {
    switch (item.category) {
      case 'hazard':
        return t('historyView.catHazard');
      case 'device':
        return t('historyView.catDevice');
      case 'network':
        return t('historyView.catNetwork');
      default:
        return t('historyView.catSystem');
    }
  };

  const getCardStyle = (type) => {
    switch (type) {
      case 'error':
        return styles.cardHazard;
      case 'warning':
        return styles.cardWarning;
      case 'success':
        return styles.cardSuccess;
      default:
        return styles.cardInfo;
    }
  };

  const getIconBoxStyle = (type) => {
    switch (type) {
      case 'error':
        return styles.iconHazard;
      case 'warning':
        return styles.iconWarning;
      case 'success':
        return styles.iconSuccess;
      default:
        return styles.iconInfo;
    }
  };

  const renderIcon = (type) => {
    switch (type) {
      case 'error':
        return <AlertCircle size={18} />;
      case 'warning':
        return <AlertTriangle size={18} />;
      case 'success':
        return <CheckCircle2 size={18} />;
      default:
        return <Info size={18} />;
    }
  };

  const formatTimestamp = (ms) => {
    if (!Number.isFinite(ms)) return '--';
    try {
      const d = new Date(ms);
      return `${d.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      })} · ${d.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })}`;
    } catch {
      return new Date(ms).toISOString();
    }
  };

  const computeRemainingDays = (item) => {
    if (Number.isFinite(item.daysRemaining)) {
      return Math.max(1, item.daysRemaining);
    }
    const createdAtMs = Number.isFinite(item.createdAtMs) ? item.createdAtMs : nowMs;
    const expiresAtMs = Number.isFinite(item.expiresAtMs) ? item.expiresAtMs : createdAtMs + RETENTION_MS;
    return Math.max(1, Math.ceil((expiresAtMs - nowMs) / ONE_DAY_MS));
  };

  const handleCleanupClick = async () => {
    if (!onRunCleanup || isBusy) return;
    setIsBusy(true);
    try {
      await onRunCleanup();
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearAllClick = async () => {
    if (!onClearAll || isBusy) return;
    setIsBusy(true);
    try {
      await onClearAll();
    } finally {
      setIsBusy(false);
    }
  };

  const projectId = historyMeta?.projectId || 'testprojectesp32s3forfirebase';
  const collectionName = historyMeta?.collection || 'notificationHistory';
  const firebaseConnected = Boolean(historyMeta?.firebaseConnected);
  const credentialsPath = historyMeta?.credentialsPath
    || 'C:/Users/BAO HAO/AppData/Local/FaultTolerantIoT/firebase-test/service-account.json';

  return (
    <div className={styles.container}>
      {/* 1. Header & Firebase 30-Day Retention Metadata Card */}
      <section className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.headerTitleGroup}>
            <span className={styles.screenTag}>
              <Bell size={14} />
              <span>{t('historyView.screenTag')}</span>
            </span>
            <h2 className={styles.title}>{t('historyView.title')}</h2>
            <p className={styles.subtitle}>{t('historyView.subtitle')}</p>
          </div>

          {!isVisitor && (
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.cleanupBtn}
                onClick={handleCleanupClick}
                disabled={isBusy}
              >
                <RefreshCw size={14} />
                <span>{t('historyView.cleanupBtn')}</span>
              </button>

              <button
                type="button"
                className={styles.clearBtn}
                onClick={handleClearAllClick}
                disabled={isBusy || notificationHistory.length === 0}
              >
                <Trash2 size={14} />
                <span>{t('historyView.clearAllBtn')}</span>
              </button>
            </div>
          )}
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>{t('historyView.projectLabel')}</span>
            <span className={styles.metaValue}>
              <Database size={14} color="var(--accent-primary)" />
              <code className={styles.metaCode}>{projectId}</code>
            </span>
          </div>

          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>{t('historyView.collectionLabel')}</span>
            <span className={styles.metaValue}>
              <Cloud size={14} color="var(--accent-primary)" />
              <code className={styles.metaCode}>{collectionName}</code>
            </span>
          </div>

          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>{t('historyView.retentionLabel')}</span>
            <span className={styles.metaValue}>
              <Clock size={14} color="var(--accent-primary)" />
              <span>{t('historyView.retentionValue')}</span>
            </span>
          </div>

          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>{t('historyView.storageStatusLabel')}</span>
            <span className={styles.metaValue}>
              <span className={firebaseConnected ? styles.statusDotLive : styles.statusDotBuffer} />
              <span>
                {firebaseConnected
                  ? t('historyView.firebaseConnected')
                  : t('historyView.firebaseBuffered')}
              </span>
            </span>
          </div>

          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>{t('historyView.totalRecordsLabel')}</span>
            <span className={styles.metaValue}>
              <Bell size={14} color="var(--accent-primary)" />
              <span>{t('historyView.recordsCount', { count: notificationHistory.length })}</span>
            </span>
          </div>
        </div>

        <div className={styles.pathBanner}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
            <KeyRound size={14} color="var(--accent-primary)" />
            <span>{t('historyView.keyPathLabel')}:</span>
          </span>
          <code className={styles.pathCode}>{credentialsPath}</code>
        </div>
      </section>

      {/* 2. Category Filter Tabs */}
      <div className={styles.filterBar}>
        <div className={styles.filterTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'ALL'}
            className={`${styles.filterTab} ${activeFilter === 'ALL' ? styles.filterTabActive : ''}`}
            onClick={() => setActiveFilter('ALL')}
          >
            <span>{t('historyView.filterAll', { count: notificationHistory.length })}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'HAZARD'}
            className={`${styles.filterTab} ${activeFilter === 'HAZARD' ? styles.filterTabActive : ''}`}
            onClick={() => setActiveFilter('HAZARD')}
          >
            <span>{t('historyView.filterHazard', { count: hazardCount })}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'DEVICE'}
            className={`${styles.filterTab} ${activeFilter === 'DEVICE' ? styles.filterTabActive : ''}`}
            onClick={() => setActiveFilter('DEVICE')}
          >
            <span>{t('historyView.filterDevice', { count: deviceCount })}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === 'NETWORK'}
            className={`${styles.filterTab} ${activeFilter === 'NETWORK' ? styles.filterTabActive : ''}`}
            onClick={() => setActiveFilter('NETWORK')}
          >
            <span>{t('historyView.filterNetwork', { count: networkCount })}</span>
          </button>
        </div>
      </div>

      {/* 3. Notification Records List */}
      {filteredItems.length === 0 ? (
        <div className={styles.emptyCard}>
          <Bell size={28} color="var(--text-muted)" />
          <h3 className={styles.emptyTitle}>{t('historyView.emptyTitle')}</h3>
          <p className={styles.emptyDesc}>{t('historyView.emptyDesc')}</p>
        </div>
      ) : (
        <div className={styles.listContainer}>
          {filteredItems.map((item) => {
            const params = resolveParams(item.params);
            const titleText = item.titleKey ? t(item.titleKey, params) : item.title;
            const messageText = item.messageKey
              ? t(item.messageKey, params)
              : (params.ack && item.appendLatencyMs !== undefined
                ? `${params.ack} (${item.appendLatencyMs}ms).`
                : item.message);
            const remainingDays = computeRemainingDays(item);

            return (
              <article
                key={item.id}
                className={`${styles.historyCard} ${getCardStyle(item.type)}`}
              >
                <div className={styles.cardLeft}>
                  <div className={`${styles.iconBox} ${getIconBoxStyle(item.type)}`}>
                    {renderIcon(item.type)}
                  </div>

                  <div className={styles.cardContent}>
                    <div className={styles.cardTitleRow}>
                      <span className={styles.cardTitle}>{titleText}</span>
                      <span className={styles.categoryPill}>{getCategoryLabel(item)}</span>
                      {item.syncedToFirebase ? (
                        <span className={styles.syncPill}>
                          <Cloud size={11} />
                          <span>{t('historyView.syncedBadge')}</span>
                        </span>
                      ) : (
                        <span className={styles.bufferPill}>
                          <HardDrive size={11} />
                          <span>{t('historyView.bufferedBadge')}</span>
                        </span>
                      )}
                      <span className={styles.expiryPill}>
                        <Clock size={11} />
                        <span>{t('historyView.expiresInDays', { days: remainingDays })}</span>
                      </span>
                    </div>

                    {messageText && <p className={styles.cardMessage}>{messageText}</p>}

                    <div className={styles.cardFooterMeta}>
                      <span>{formatTimestamp(item.createdAtMs)}</span>
                      <span>·</span>
                      <span>
                        {t('common.source')}: {translateSource(item.source || 'SafeHaven Local-First')}
                      </span>
                      <span>·</span>
                      <code>{item.projectId || projectId}</code>
                    </div>
                  </div>
                </div>

                {!isVisitor && onDeleteItem && (
                  <div className={styles.cardRight}>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => onDeleteItem(item.id)}
                      title={t('historyView.deleteItemBtn')}
                    >
                      <Trash2 size={13} />
                      <span>{t('historyView.deleteItemBtn')}</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
