import { ShieldCheck, WifiOff, RefreshCw, XOctagon, ArrowUpRight } from 'lucide-react';
import styles from './ModeBanner.module.css';

export default function ModeBanner({ networkState, onNavigateToConnections }) {
  const { mode } = networkState;

  if (mode === 'NORMAL') {
    return (
      <div className={`${styles.banner} ${styles.bannerNormal}`}>
        <div className={styles.leftGroup}>
          <ShieldCheck size={20} className={styles.iconGreen} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>Your home is securely connected</span>
            <span className={styles.subtext}>
              Devices are ready. Commands complete only after device acknowledgment.
            </span>
          </div>
        </div>

        {onNavigateToConnections && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={onNavigateToConnections}
          >
            <span>View connections</span>
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
            <span className={styles.headline}>LOCAL MODE · Local control</span>
            <span className={styles.subtext}>
              Internet disconnected. You can still control devices over the local network.
            </span>
          </div>
        </div>

        <span className={styles.sinceText}>Since 10:22:05</span>
      </div>
    );
  }

  if (mode === 'SWITCHING') {
    return (
      <div className={`${styles.banner} ${styles.bannerSwitching}`}>
        <div className={styles.leftGroup}>
          <RefreshCw size={20} className={`${styles.iconBlue} ${styles.spin}`} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>SWITCHING · Establishing Local Path</span>
            <span className={styles.subtext}>
              Verifying control path. Keep confirmed values; pause new commands briefly.
            </span>
          </div>
        </div>
        <span className={styles.statusWait}>Resolving...</span>
      </div>
    );
  }

  if (mode === 'RECONNECTING') {
    return (
      <div className={`${styles.banner} ${styles.bannerReconnecting}`}>
        <div className={styles.leftGroup}>
          <RefreshCw size={20} className={`${styles.iconIndigo} ${styles.spin}`} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>RECONNECTING · Restoring Cloud Telemetry</span>
            <span className={styles.subtext}>
              Internet connection recovered. Replaying buffered local telemetry back to cloud.
            </span>
          </div>
        </div>
        <span className={styles.statusWait}>Syncing...</span>
      </div>
    );
  }

  return (
    <div className={`${styles.banner} ${styles.bannerUnavailable}`}>
      <div className={styles.leftGroup}>
        <XOctagon size={20} className={styles.iconRed} />
        <div className={styles.textGroup}>
          <span className={styles.headline}>UNAVAILABLE · Control unavailable</span>
          <span className={styles.subtext}>
            Unable to reach Local LAN or Central ESP32 Gateway. Controls are temporarily disabled.
          </span>
        </div>
      </div>
    </div>
  );
}
