import { useState, useEffect, useRef } from 'react';
import { Home, Menu, LogOut, User, Users, Activity, ChevronDown } from 'lucide-react';
import styles from './Header.module.css';

export default function Header({
  networkMode,
  activeScreenName = 'Overview',
  onOpenMobileMenu,
  currentUser,
  onSignOut,
  isSigningOut = false,
  onSelectScreen
}) {
  const isLocal = networkMode === 'LOCAL';
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [menuOpen]);

  const userInitials = currentUser?.username
    ? currentUser.username.slice(0, 2).toUpperCase()
    : 'SH';
  const isVisitor = currentUser?.role === 'visitor';
  const roleText = isVisitor ? 'Visitor · Read-Only' : 'Administrator';

  return (
    <div className={styles.topArea}>
      {/* 1. Top Breadcrumb & Timestamp Bar */}
      <div className={styles.topBreadcrumbBar}>
        <div className={styles.breadcrumbLeft}>
          <button
            type="button"
            className={styles.mobileMenuBtn}
            onClick={onOpenMobileMenu}
            title="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          <Home size={15} color="#24362d" />
          <span className={styles.crumbRoot}>SafeHaven</span>
          <span className={styles.crumbDivider}>/</span>
          <span className={styles.crumbActive}>{activeScreenName}</span>
        </div>

        <div className={styles.topRightMeta}>
          <span className={styles.timestampText}>
            {currentTimeStr || '10:24 · Mon, Oct 26, 2026'}
          </span>
          <div className={`${styles.localFirstTag} ${isLocal ? styles.tagLocal : ''}`}>
            <span className={styles.dot}></span>
            <span>{isLocal ? 'LAN Fallback Active' : 'Local-First Architecture'}</span>
          </div>

          {/* Synchronized User Profile & Logout Menu */}
          {currentUser && (
            <div className={styles.userMenuWrapper} ref={menuRef}>
              <button
                type="button"
                className={styles.userTriggerBtn}
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                title={`Signed in as ${currentUser.username} (${roleText})`}
              >
                <span className={styles.avatarCircle}>{userInitials}</span>
                <span className={styles.triggerName}>{currentUser.username}</span>
                <span className={`${styles.rolePill} ${isVisitor ? styles.roleVisitor : styles.roleAdmin}`}>
                  {isVisitor ? 'Visitor' : 'Admin'}
                </span>
                <ChevronDown size={13} className={styles.chevron} />
              </button>

              {menuOpen && (
                <div className={styles.userDropdown} role="menu">
                  <div className={styles.dropdownHeader}>
                    <div className={styles.dropdownUserRow}>
                      <User size={15} />
                      <strong>{currentUser.username}</strong>
                    </div>
                    <span className={styles.dropdownRole}>{roleText}</span>
                  </div>

                  <div className={styles.dropdownDivider} />

                  {onSelectScreen && (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onSelectScreen('SENSORS');
                      }}
                    >
                      <Activity size={15} />
                      <span>Environmental Sensors</span>
                    </button>
                  )}

                  {!isVisitor && onSelectScreen && (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onSelectScreen('USERS');
                      }}
                    >
                      <Users size={15} />
                      <span>Manage User Accounts</span>
                    </button>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    className={`${styles.dropdownItem} ${styles.dropdownSignOut}`}
                    disabled={isSigningOut}
                    onClick={() => {
                      setMenuOpen(false);
                      if (onSignOut) onSignOut();
                    }}
                  >
                    <LogOut size={15} />
                    <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Title Row with Status Badge */}
      <div className={styles.titleRow}>
        <div className={styles.titleLeft}>
          <span className={styles.eyebrow}>SAFEHAVEN SMART HOME</span>
          <h1 className={styles.pageTitle}>
            {activeScreenName === 'Overview' ? 'Home Overview' : activeScreenName}
          </h1>
          <p className={styles.pageSubtitle}>
            {isVisitor
              ? 'Read-only environmental sensor telemetry and network link diagnostics.'
              : 'Autonomous local-first device control, fire safety monitoring, and link diagnostics.'}
          </p>
        </div>

        <div className={styles.titleRight}>
          {networkMode === 'NORMAL' && (
            <div className={styles.badgeNormal}>
              <span className={styles.dotGreen}></span>
              <span>ONLINE · Normal Mode</span>
            </div>
          )}
          {networkMode === 'LOCAL' && (
            <div className={styles.badgeLocal}>
              <span className={styles.dotAmber}></span>
              <span>LOCAL · LAN Fallback</span>
            </div>
          )}
          {networkMode === 'SWITCHING' && (
            <div className={styles.badgeSwitching}>
              <span className={styles.dotBlue}></span>
              <span>SWITCHING · Resolving LAN</span>
            </div>
          )}
          {networkMode === 'RECONNECTING' && (
            <div className={styles.badgeReconnecting}>
              <span className={styles.dotIndigo}></span>
              <span>RECONNECTING · Cloud Sync</span>
            </div>
          )}
          {networkMode === 'UNAVAILABLE' && (
            <div className={styles.badgeUnavailable}>
              <span className={styles.dotRed}></span>
              <span>UNAVAILABLE · Controls Locked</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
