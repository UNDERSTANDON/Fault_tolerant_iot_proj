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
            <span className={styles.headline}>Demo mode · simulated network status</span>
            <span className={styles.subtext}>
              Room readings and device states are simulated. No hardware commands are connected.
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
            <span className={styles.headline}>LOCAL MODE · simulated scenario</span>
            <span className={styles.subtext}>
              This changes the demo state only; it does not switch a live network or control hardware.
            </span>
          </div>
        </div>

        <span className={styles.sinceText}>Demo state</span>
      </div>
    );
  }

  if (mode === 'SWITCHING') {
    return (
      <div className={`${styles.banner} ${styles.bannerSwitching}`}>
        <div className={styles.leftGroup}>
          <RefreshCw size={20} className={`${styles.iconBlue} ${styles.spin}`} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>SWITCHING · simulated transition</span>
            <span className={styles.subtext}>
              The dashboard is demonstrating a state transition; no network path is being verified.
            </span>
          </div>
        </div>
        <span className={styles.statusWait}>Simulation</span>
      </div>
    );
  }

  if (mode === 'RECONNECTING') {
    return (
      <div className={`${styles.banner} ${styles.bannerReconnecting}`}>
        <div className={styles.leftGroup}>
          <RefreshCw size={20} className={`${styles.iconIndigo} ${styles.spin}`} />
          <div className={styles.textGroup}>
            <span className={styles.headline}>RECONNECTING · simulated recovery</span>
            <span className={styles.subtext}>
              No cloud connection or buffered telemetry is being used by this demo scenario.
            </span>
          </div>
        </div>
        <span className={styles.statusWait}>Simulation</span>
      </div>
    );
  }

  return (
    <div className={`${styles.banner} ${styles.bannerUnavailable}`}>
      <div className={styles.leftGroup}>
        <XOctagon size={20} className={styles.iconRed} />
        <div className={styles.textGroup}>
          <span className={styles.headline}>UNAVAILABLE · simulated scenario</span>
          <span className={styles.subtext}>
            Demo controls are paused. This does not report live ESP32, LAN, or device availability.
          </span>
        </div>
      </div>
    </div>
  );
}
