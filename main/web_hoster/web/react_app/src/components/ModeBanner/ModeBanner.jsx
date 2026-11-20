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
              All 4 domestic zones are active. Local LAN and MQTT telemetry channels are online.
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
            <span className={styles.headline}>LOCAL MODE · Autonomous LAN Control Active</span>
            <span className={styles.subtext}>
              External Internet is offline. Room switches and fire safety sensors remain operational over Local LAN.
            </span>
          </div>
        </div>

        {onNavigateToConnections ? (
          <button
            type="button"
            className={styles.linkButton}
            onClick={onNavigateToConnections}
          >
            <span>View connections</span>
            <ArrowUpRight size={14} />
          </button>
        ) : (
          <span className={styles.sinceText}>LAN Fallback</span>
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
            <span className={styles.headline}>SWITCHING · Establishing Local LAN Path</span>
            <span className={styles.subtext}>
              Verifying local gateway routing. Confirmed device states are preserved during handover.
            </span>
          </div>
        </div>
        <span className={styles.statusWait}>Routing...</span>
      </div>
    );
  }

  if (mode === 'RECONNECTING') {
    return (
      <div className={`${styles.banner} ${styles.bannerReconnecting}`}>
        <div className={styles.leftGroup}>
          <RefreshCw size={20} className={`${styles.iconIndigo} ${styles.spin}`} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>RECONNECTING · Synchronizing Cloud Telemetry</span>
            <span className={styles.subtext}>
              Carrier link restored. Replaying buffered local events to remote cloud storage.
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
          <span className={styles.headline}>UNAVAILABLE · Local Gateway Unreachable</span>
          <span className={styles.subtext}>
            Unable to reach Local LAN or ESP32-S3 Gateway. Remote actuation is locked until link recovery.
          </span>
        </div>
      </div>
    </div>
  );
}
