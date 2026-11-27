import { useState, useEffect, useRef } from 'react';
import { Home, Menu, LogOut, User, Users, Activity, ChevronDown, Settings, Sun, Moon, Globe, Bell } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './Header.module.css';

export default function Header({
  networkMode,
  activeScreenName = 'Overview',
  onOpenMobileMenu,
  currentUser,
  onSignOut,
  isSigningOut = false,
  onSelectScreen,
  onQuickThemeToggle,
  notificationCount = 0
}) {
  const { locale, currentLangMeta, theme, toggleTheme, t } = useLanguage();
  const isLocal = networkMode === 'LOCAL';
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = now.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      setCurrentTimeStr(`${timeStr} · ${dateStr}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [locale]);

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
  const roleText = isVisitor ? t('common.visitorReadOnly') : t('common.administrator');

  const handleThemeBtn = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    toggleTheme();
    if (onQuickThemeToggle) {
      onQuickThemeToggle(next);
    }
  };

  return (
    <div className={styles.topArea}>
      {/* 1. Top Breadcrumb & Timestamp Bar */}
      <div className={styles.topBreadcrumbBar}>
        <div className={styles.breadcrumbLeft}>
          <button
            type="button"
            className={styles.mobileMenuBtn}
            onClick={onOpenMobileMenu}
            title="Menu"
          >
            <Menu size={20} />
          </button>

          <Home size={15} color="var(--accent-primary)" />
          <span className={styles.crumbRoot}>SafeHaven</span>
          <span className={styles.crumbDivider}>/</span>
          <span className={styles.crumbActive}>{activeScreenName}</span>
        </div>

        <div className={styles.topRightMeta}>
          <span className={styles.timestampText}>
            {currentTimeStr}
          </span>
          <div className={`${styles.localFirstTag} ${isLocal ? styles.tagLocal : ''}`}>
            <span className={styles.dot}></span>
            <span>{isLocal ? t('header.lanFallbackActive') : t('header.localFirstArch')}</span>
          </div>

          {/* Quick Theme Toggle & Language/Settings Shortcut */}
          <button
            type="button"
            onClick={handleThemeBtn}
            title={theme === 'dark' ? t('settings.lightModeTitle') : t('settings.darkModeTitle')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)'
            }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {onSelectScreen && (
            <button
              type="button"
              onClick={() => onSelectScreen('NOTIFICATION_HISTORY')}
              title={t('header.notificationHistory')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                height: '32px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.73rem',
                fontWeight: 700
              }}
            >
              <Bell size={14} color="var(--accent-primary)" />
              <span>{notificationCount}</span>
            </button>
          )}

          {onSelectScreen && (
            <button
              type="button"
              onClick={() => onSelectScreen('SETTINGS')}
              title={t('header.settings')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                height: '32px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.73rem',
                fontWeight: 700
              }}
            >
              <Globe size={14} color="var(--accent-primary)" />
              <span>{currentLangMeta.code.toUpperCase()}</span>
            </button>
          )}

          {/* Synchronized User Profile & Logout Menu */}
          {currentUser && (
            <div className={styles.userMenuWrapper} ref={menuRef}>
              <button
                type="button"
                className={styles.userTriggerBtn}
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className={styles.avatarCircle}>{userInitials}</span>
                <span className={styles.triggerName}>{currentUser.username}</span>
                <span className={`${styles.rolePill} ${isVisitor ? styles.roleVisitor : styles.roleAdmin}`}>
                  {isVisitor ? t('common.visitor') : t('common.adminShort')}
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
                      <span>{t('header.envSensors')}</span>
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
                      <span>{t('header.manageUsers')}</span>
                    </button>
                  )}

                  {onSelectScreen && (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onSelectScreen('NOTIFICATION_HISTORY');
                      }}
                    >
                      <Bell size={15} />
                      <span>{t('header.notificationHistory')}</span>
                    </button>
                  )}

                  {onSelectScreen && (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setMenuOpen(false);
                        onSelectScreen('SETTINGS');
                      }}
                    >
                      <Settings size={15} />
                      <span>{t('header.settings')}</span>
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
                    <span>{isSigningOut ? t('header.signingOut') : t('sidebar.signOut')}</span>
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
          <span className={styles.eyebrow}>{t('header.eyebrow')}</span>
          <h1 className={styles.pageTitle}>
            {activeScreenName}
          </h1>
          <p className={styles.pageSubtitle}>
            {isVisitor ? t('header.subtitleVisitor') : t('header.subtitleAdmin')}
          </p>
        </div>

        <div className={styles.titleRight}>
          {networkMode === 'NORMAL' && (
            <div className={styles.badgeNormal}>
              <span className={styles.dotGreen}></span>
              <span>{t('header.badgeNormal')}</span>
            </div>
          )}
          {networkMode === 'LOCAL' && (
            <div className={styles.badgeLocal}>
              <span className={styles.dotAmber}></span>
              <span>{t('header.badgeLocal')}</span>
            </div>
          )}
          {networkMode === 'SWITCHING' && (
            <div className={styles.badgeSwitching}>
              <span className={styles.dotBlue}></span>
              <span>{t('header.badgeSwitching')}</span>
            </div>
          )}
          {networkMode === 'RECONNECTING' && (
            <div className={styles.badgeReconnecting}>
              <span className={styles.dotIndigo}></span>
              <span>{t('header.badgeReconnecting')}</span>
            </div>
          )}
          {networkMode === 'UNAVAILABLE' && (
            <div className={styles.badgeUnavailable}>
              <span className={styles.dotRed}></span>
              <span>{t('header.badgeUnavailable')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
