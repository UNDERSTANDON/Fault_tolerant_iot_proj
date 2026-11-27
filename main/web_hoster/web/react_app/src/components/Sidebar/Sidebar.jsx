import { useState } from 'react';
import { MapPin, ChevronDown, LayoutGrid, Compass, Sofa, Utensils, Bed, Network, FlaskConical, ShieldCheck, Users, Activity, Cpu, Settings, Bell, X, LogOut } from 'lucide-react';
import Logo from '../Logo/Logo';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './Sidebar.module.css';

export default function Sidebar({
  activeScreen,
  onSelectScreen,
  onSelectRoom,
  selectedRoomId,
  currentMode,
  isMobileOpen,
  onCloseMobile,
  currentUser,
  onSignOut,
  isSigningOut = false,
  onManageUsers,
  hardwareStatus,
  bridgeState,
  notificationCount = 0
}) {
  const { t, translateSource } = useLanguage();
  useScrollLock(Boolean(isMobileOpen));
  const [isAptOpen, setIsAptOpen] = useState(false);

  const isOverview = activeScreen === 'DASHBOARD' && !selectedRoomId;
  const isSensors = activeScreen === 'SENSORS' && !selectedRoomId;
  const isConnections = (activeScreen === 'DIAGNOSTICS' || activeScreen === 'LOCAL_FALLBACK' || activeScreen === 'RECOVERY') && !selectedRoomId;
  const isHistory = activeScreen === 'NOTIFICATION_HISTORY' && !selectedRoomId;
  const isTesting = activeScreen === 'RESEARCH_TEST' && !selectedRoomId;
  const isUsers = activeScreen === 'USERS' && !selectedRoomId;
  const isSettings = activeScreen === 'SETTINGS' && !selectedRoomId;
  const isVisitor = currentUser?.role === 'visitor';

  const handleNavClick = (screenId) => {
    onSelectRoom(null);
    onSelectScreen(screenId);
    if (onCloseMobile) onCloseMobile();
  };

  const handleRoomClick = (roomId) => {
    onSelectScreen('DASHBOARD');
    onSelectRoom(roomId);
    if (onCloseMobile) onCloseMobile();
  };

  const roleLabel = isVisitor ? t('common.visitorReadOnly') : t('common.administrator');

  return (
    <>
      {isMobileOpen && (
        <div className={styles.mobileBackdrop} onClick={onCloseMobile} aria-hidden="true" />
      )}

      <aside className={`${styles.sidebar} ${isMobileOpen ? styles.sidebarMobileOpen : ''}`}>
        {isMobileOpen && (
          <button
            type="button"
            className={styles.mobileCloseBtn}
            onClick={onCloseMobile}
            title={t('common.close')}
          >
            <X size={18} />
          </button>
        )}

        {/* 1. SafeHaven Branding */}
        <div className={styles.brand}>
          <Logo size="sm" showText subtitle={t('sidebar.subtitle')} />
        </div>

        {/* 2. Interactive Apartment & Gateway Popover Card */}
        <div className={styles.aptWrapper}>
          <button
            type="button"
            className={`${styles.apartmentCard} ${isAptOpen ? styles.apartmentCardActive : ''}`}
            onClick={() => setIsAptOpen((prev) => !prev)}
            aria-expanded={isAptOpen}
          >
            <div className={styles.apartmentLeft}>
              <div className={styles.pinCircle}>
                <MapPin size={15} color="var(--accent-primary)" />
              </div>
              <div className={styles.apartmentMeta}>
                <span className={styles.apartmentTitle}>{t('sidebar.myApartment')}</span>
                <span className={styles.apartmentSub}>{t('sidebar.zonesSensors')}</span>
              </div>
            </div>
            <ChevronDown
              size={14}
              color="var(--text-secondary)"
              className={isAptOpen ? styles.chevronRotated : styles.chevronNormal}
            />
          </button>

          {isAptOpen && (
            <div className={styles.aptPopover}>
              <div className={styles.aptRow}>
                <Cpu size={13} className={styles.aptIcon} />
                <span>{t('sidebar.edgeMcu')}: <strong>ESP32-S3 (v6.1)</strong></span>
              </div>
              <div className={styles.aptRow}>
                <Network size={13} className={styles.aptIcon} />
                <span>{t('sidebar.lanSubnet')}: <code>192.168.4.1 / LAN</code></span>
              </div>
              <div className={styles.aptRow}>
                <Activity size={13} className={styles.aptIcon} />
                <span>{t('sidebar.sensorBus')}: <strong>DHT11 · MQ-2 · 4 LED</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* 3. Navigation Links */}
        <div className={styles.navSection}>
          <span className={styles.sectionHeader}>
            {isVisitor ? t('sidebar.telemetryDiag') : t('sidebar.spacesControls')}
          </span>

          <nav className={styles.navList}>
            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${isOverview ? styles.navItemActive : ''}`}
                onClick={() => handleNavClick('DASHBOARD')}
              >
                <LayoutGrid size={17} />
                <span>{t('sidebar.overview')}</span>
              </button>
            )}

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${selectedRoomId === 'hallway' ? styles.navItemActive : ''}`}
                onClick={() => handleRoomClick('hallway')}
              >
                <Compass size={17} />
                <span>{t('rooms.hallway.name')}</span>
              </button>
            )}

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${selectedRoomId === 'living_room' ? styles.navItemActive : ''}`}
                onClick={() => handleRoomClick('living_room')}
              >
                <Sofa size={17} />
                <span>{t('rooms.living_room.name')}</span>
              </button>
            )}

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${selectedRoomId === 'kitchen' ? styles.navItemActive : ''}`}
                onClick={() => handleRoomClick('kitchen')}
              >
                <Utensils size={17} />
                <span>{t('rooms.kitchen.name')}</span>
              </button>
            )}

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${selectedRoomId === 'bedroom' ? styles.navItemActive : ''}`}
                onClick={() => handleRoomClick('bedroom')}
              >
                <Bed size={17} />
                <span>{t('rooms.bedroom.name')}</span>
              </button>
            )}

            <button
              type="button"
              className={`${styles.navItem} ${isSensors ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick('SENSORS')}
            >
              <Activity size={17} />
              <span>{t('sidebar.sensors')}</span>
            </button>

            <button
              type="button"
              className={`${styles.navItem} ${isConnections ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick('DIAGNOSTICS')}
            >
              <Network size={17} />
              <span>{t('sidebar.connections')}</span>
              {currentMode === 'LOCAL' && <span className={styles.localBadge}>LOCAL</span>}
            </button>

            <button
              type="button"
              className={`${styles.navItem} ${isHistory ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick('NOTIFICATION_HISTORY')}
            >
              <Bell size={17} />
              <span>{t('sidebar.notificationHistory')}</span>
              {notificationCount > 0 && (
                <span className={styles.localBadge}>{notificationCount}</span>
              )}
            </button>

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${isTesting ? styles.navItemActive : ''}`}
                onClick={() => handleNavClick('RESEARCH_TEST')}
              >
                <FlaskConical size={17} />
                <span>{t('sidebar.testLab')}</span>
              </button>
            )}

            {currentUser?.role === 'admin' && onManageUsers && (
              <button
                type="button"
                className={`${styles.navItem} ${isUsers ? styles.navItemActive : ''}`}
                onClick={() => {
                  onSelectRoom(null);
                  onManageUsers();
                  if (onCloseMobile) onCloseMobile();
                }}
              >
                <Users size={17} />
                <span>{t('sidebar.userAccounts')}</span>
              </button>
            )}

            {/* Settings (Available to both Admin & Visitor) */}
            <button
              type="button"
              className={`${styles.navItem} ${isSettings ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick('SETTINGS')}
            >
              <Settings size={17} />
              <span>{t('sidebar.settings')}</span>
            </button>
          </nav>
        </div>

        {/* 4. Always Close To Home Card */}
        <div className={styles.infoCard}>
          <div className={styles.infoIconCircle}>
            <ShieldCheck size={18} color="var(--accent-primary)" />
          </div>
          <h4 className={styles.infoTitle}>{t('sidebar.alwaysCloseTitle')}</h4>
          <p className={styles.infoText}>{t('sidebar.alwaysCloseText')}</p>
        </div>

        {/* 5. User Account & Synchronized Sign Out */}
        {currentUser && (
          <div className={styles.userCard}>
            <div className={styles.userInfo}>
              <div className={styles.userAvatar}>
                {currentUser.username.slice(0, 2).toUpperCase()}
              </div>
              <div className={styles.userMeta}>
                <span className={styles.userName}>{currentUser.username}</span>
                <span className={styles.userRole}>{roleLabel}</span>
              </div>
            </div>
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={onSignOut}
              disabled={isSigningOut}
              title={t('sidebar.signOut')}
            >
              <LogOut size={15} />
              <span>{isSigningOut ? t('sidebar.wait') : t('sidebar.signOut')}</span>
            </button>
          </div>
        )}

        {/* 6. System Data Source Footer */}
        <div className={styles.sidebarFooter}>
          <div className={styles.simulatedTag}>
            <span className={styles.greenDot}></span>
            <span>{t('sidebar.engineTitle')}</span>
          </div>
          <span className={styles.disclaimer}>
            {t('common.source')}: {translateSource(hardwareStatus?.dataSource)} · {t('common.bridge')}: {bridgeState?.status === 'connected' ? t('common.liveMqtt') : t('common.offline')}
          </span>
        </div>
      </aside>
    </>
  );
}
