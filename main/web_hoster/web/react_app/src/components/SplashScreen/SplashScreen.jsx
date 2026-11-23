import { ShieldCheck, Wifi } from 'lucide-react';
import Logo from '../Logo/Logo';
import { useScrollLock } from '../../hooks/useScrollLock';
import styles from './SplashScreen.module.css';

export default function SplashScreen({ statusText = 'Initializing local gateway & security session...' }) {
  useScrollLock(true);

  return (
    <div className={styles.splashOverlay} role="status" aria-live="polite" aria-label="Loading SafeHaven">
      <div className={styles.splashCard}>
        <div className={styles.logoPulseWrap}>
          <Logo size="xl" />
        </div>

        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>LOCAL-FIRST RESILIENT IOT</span>
          <h1 className={styles.brandHeading}>SafeHaven</h1>
          <p className={styles.tagline}>
            Autonomous Home Control &amp; Environmental Safety System
          </p>
        </div>

        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressFill} />
        </div>

        <p className={styles.statusLine}>{statusText}</p>

        <div className={styles.pillsRow}>
          <span className={styles.pill}>
            <ShieldCheck size={13} />
            <span>Edge-Autonomous Safety</span>
          </span>
          <span className={styles.pill}>
            <Wifi size={13} />
            <span>ESP32-S3 &amp; LAN Ready</span>
          </span>
        </div>
      </div>
    </div>
  );
}
