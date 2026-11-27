import { ShieldCheck, WifiOff, RefreshCw, XOctagon, ArrowUpRight } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './ModeBanner.module.css';

export default function ModeBanner({ networkState, hardwareStatus, onNavigateToConnections }) {
  const { t } = useLanguage();
  const { mode } = networkState;
  const isEspLive = Boolean(hardwareStatus?.isLive);

  if (mode === 'NORMAL' && !isEspLive) {
    return (
      <div className={`${styles.banner} ${styles.bannerLocal}`}>
        <div className={styles.leftGroup}>
          <WifiOff size={20} className={styles.iconAmber} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>{t('banners.waitingHeadline')}</span>
            <span className={styles.subtext}>{t('banners.waitingSubtext')}</span>
          </div>
        </div>

        {onNavigateToConnections && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={onNavigateToConnections}
          >
            <span>{t('common.viewConnections')}</span>
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    );
  }

  if (mode === 'NORMAL') {
    return (
      <div className={`${styles.banner} ${styles.bannerNormal}`}>
        <div className={styles.leftGroup}>
          <ShieldCheck size={20} className={styles.iconGreen} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>{t('banners.normalHeadline')}</span>
            <span className={styles.subtext}>{t('banners.normalSubtext')}</span>
          </div>
        </div>

        {onNavigateToConnections && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={onNavigateToConnections}
          >
            <span>{t('common.viewConnections')}</span>
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    );
  }

  if (mode === 'LOCAL') {
    return (
      <div className={`${styles.banner} ${styles.bannerLocal}`}>
        <div className={styles.leftGroup}>
          <WifiOff size={20} className={styles.iconAmber} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>{t('banners.localHeadline')}</span>
            <span className={styles.subtext}>{t('banners.localSubtext')}</span>
          </div>
        </div>

        {onNavigateToConnections ? (
          <button
            type="button"
            className={styles.linkButton}
            onClick={onNavigateToConnections}
          >
            <span>{t('common.viewConnections')}</span>
            <ArrowUpRight size={14} />
          </button>
        ) : (
          <span className={styles.sinceText}>{t('banners.lanFallbackTag')}</span>
        )}
      </div>
    );
  }

  if (mode === 'SWITCHING') {
    return (
      <div className={`${styles.banner} ${styles.bannerSwitching}`}>
        <div className={styles.leftGroup}>
          <RefreshCw size={20} className={`${styles.iconBlue} ${styles.spin}`} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>{t('banners.switchingHeadline')}</span>
            <span className={styles.subtext}>{t('banners.switchingSubtext')}</span>
          </div>
        </div>
        <span className={styles.statusWait}>{t('banners.routingWait')}</span>
      </div>
    );
  }

  if (mode === 'RECONNECTING') {
    return (
      <div className={`${styles.banner} ${styles.bannerReconnecting}`}>
        <div className={styles.leftGroup}>
          <RefreshCw size={20} className={`${styles.iconIndigo} ${styles.spin}`} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>{t('banners.reconnectingHeadline')}</span>
            <span className={styles.subtext}>{t('banners.reconnectingSubtext')}</span>
          </div>
        </div>
        <span className={styles.statusWait}>{t('banners.syncingWait')}</span>
      </div>
    );
  }

  return (
    <div className={`${styles.banner} ${styles.bannerUnavailable}`}>
      <div className={styles.leftGroup}>
        <XOctagon size={20} className={styles.iconRed} />
        <div className={styles.textGroup}>
          <span className={styles.headline}>{t('banners.unavailableHeadline')}</span>
          <span className={styles.subtext}>{t('banners.unavailableSubtext')}</span>
        </div>
      </div>
    </div>
  );
}
