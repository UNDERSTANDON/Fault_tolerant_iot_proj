import { useState, useEffect } from 'react';
import { Home, Menu } from 'lucide-react';
import styles from './Header.module.css';

export default function Header({ networkMode, activeScreenName = 'Overview', onOpenMobileMenu }) {
  const isLocal = networkMode === 'LOCAL';

  // Bug 10 Fix: Live real-time clock
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      setCurrentTimeStr(`${timeStr} · ${dateStr}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.topArea}>
      {/* 1. Top Breadcrumb & Timestamp Bar */}
      <div className={styles.topBreadcrumbBar}>
        <div className={styles.breadcrumbLeft}>
          {/* Bug 1 Fix: Mobile Hamburger Menu Toggle */}
          <button
            type="button"
            className={styles.mobileMenuBtn}
            onClick={onOpenMobileMenu}
            title="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          <Home size={15} color="#24362d" />
          <span className={styles.crumbRoot}>My apartment</span>
          <span className={styles.crumbDivider}>/</span>
          <span className={styles.crumbActive}>{activeScreenName}</span>
        </div>

        <div className={styles.topRightMeta}>
          <span className={styles.timestampText}>
            {currentTimeStr || '10:24 · Mon, Oct 26, 2026'}
          </span>
          <div className={`${styles.localFirstTag} ${isLocal ? styles.tagLocal : ''}`}>
            <span className={styles.dot}></span>
            <span>{isLocal ? 'Simulated local mode' : 'Local-first demo'}</span>
          </div>
          <div className={styles.avatarCircle} title="User Profile">
            AN
          </div>
        </div>
      </div>

      {/* 2. Main Title Row with Status Badge */}
      <div className={styles.titleRow}>
        <div className={styles.titleLeft}>
          <span className={styles.eyebrow}>SMART-HOME DEMO</span>
          <h1 className={styles.pageTitle}>System overview</h1>
          <p className={styles.pageSubtitle}>Device controls and room readings are simulated; MQTT connectivity tests are shown separately.</p>
        </div>

        <div className={styles.titleRight}>
          {networkMode === 'NORMAL' && (
            <div className={styles.badgeNormal}>
              <span className={styles.dotGreen}></span>
              <span>SIMULATED · Normal scenario</span>
            </div>
          )}
          {networkMode === 'LOCAL' && (
            <div className={styles.badgeLocal}>
              <span className={styles.dotAmber}></span>
              <span>SIMULATED · Local scenario</span>
            </div>
          )}
          {networkMode === 'SWITCHING' && (
            <div className={styles.badgeSwitching}>
              <span className={styles.dotBlue}></span>
              <span>SIMULATED · Switching scenario</span>
            </div>
          )}
          {networkMode === 'RECONNECTING' && (
            <div className={styles.badgeReconnecting}>
              <span className={styles.dotIndigo}></span>
              <span>SIMULATED · Recovery scenario</span>
            </div>
          )}
          {networkMode === 'UNAVAILABLE' && (
            <div className={styles.badgeUnavailable}>
              <span className={styles.dotRed}></span>
              <span>SIMULATED · Unavailable scenario</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
