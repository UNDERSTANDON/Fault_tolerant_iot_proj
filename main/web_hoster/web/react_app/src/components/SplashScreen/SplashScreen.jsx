import { ShieldCheck, Wifi } from 'lucide-react';
import Logo from '../Logo/Logo';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './SplashScreen.module.css';

export default function SplashScreen({ statusText }) {
  const { t } = useLanguage();
  useScrollLock(true);

  return (
    <div className={styles.splashOverlay} role="status" aria-live="polite" aria-label="Loading SafeHaven">
      <div className={styles.splashCard}>
        <div className={styles.logoPulseWrap}>
          <Logo size="xl" />
        </div>

        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>{t('splash.eyebrow')}</span>
          <h1 className={styles.brandHeading}>SafeHaven</h1>
          <p className={styles.tagline}>{t('splash.tagline')}</p>
        </div>

        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressFill} />
        </div>

        <p className={styles.statusLine}>{statusText || t('splash.initializingGateway')}</p>

        <div className={styles.pillsRow}>
          <span className={styles.pill}>
            <ShieldCheck size={13} />
            <span>{t('splash.pillSafety')}</span>
          </span>
          <span className={styles.pill}>
            <Wifi size={13} />
            <span>{t('splash.pillEsp')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
