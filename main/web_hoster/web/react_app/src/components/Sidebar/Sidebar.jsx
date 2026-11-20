import { MapPin, ChevronDown, LayoutGrid, Sofa, Utensils, Bed, Network, FlaskConical, ShieldCheck, Users, Activity, X, LogOut } from 'lucide-react';
import Logo from '../Logo/Logo';
import { useScrollLock } from '../../hooks/useScrollLock';
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
  onManageUsers
}) {
  useScrollLock(Boolean(isMobileOpen));

  const isOverview = activeScreen === 'DASHBOARD' && !selectedRoomId;
  const isSensors = activeScreen === 'SENSORS' && !selectedRoomId;
  const isConnections = (activeScreen === 'DIAGNOSTICS' || activeScreen === 'LOCAL_FALLBACK' || activeScreen === 'RECOVERY') && !selectedRoomId;
  const isTesting = activeScreen === 'RESEARCH_TEST' && !selectedRoomId;
  const isUsers = activeScreen === 'USERS' && !selectedRoomId;
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

  const roleLabel = isVisitor ? 'Visitor · Read-only' : 'Administrator';

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div className={styles.mobileBackdrop} onClick={onCloseMobile} aria-hidden="true" />
      )}

      <aside className={`${styles.sidebar} ${isMobileOpen ? styles.sidebarMobileOpen : ''}`}>
        {/* Mobile Close Button */}
        {isMobileOpen && (
          <button
            type="button"
            className={styles.mobileCloseBtn}
            onClick={onCloseMobile}
            title="Close menu"
          >
            <X size={18} />
          </button>
        )}

        {/* 1. SafeHaven Branding */}
        <div className={styles.brand}>
          <Logo size="sm" showText subtitle="RESILIENT SMART HOME" />
        </div>

        {/* 2. Apartment Dropdown Card */}
        <div className={styles.apartmentCard}>
          <div className={styles.apartmentLeft}>
            <div className={styles.pinCircle}>
              <MapPin size={15} color="#285640" />
            </div>
            <div className={styles.apartmentMeta}>
              <span className={styles.apartmentTitle}>My apartment</span>
              <span className={styles.apartmentSub}>4 monitored zones</span>
            </div>
          </div>
          <ChevronDown size={14} color="#6b756d" />
        </div>

        {/* 3. Navigation Links */}
        <div className={styles.navSection}>
          <span className={styles.sectionHeader}>
            {isVisitor ? 'TELEMETRY & DIAGNOSTICS' : 'SPACES & CONTROLS'}
          </span>

          <nav className={styles.navList}>
            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${isOverview ? styles.navItemActive : ''}`}
                onClick={() => handleNavClick('DASHBOARD')}
              >
                <LayoutGrid size={18} />
                <span>Overview</span>
              </button>
            )}

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${selectedRoomId === 'living_room' ? styles.navItemActive : ''}`}
                onClick={() => handleRoomClick('living_room')}
              >
                <Sofa size={18} />
                <span>Living room</span>
              </button>
            )}

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${selectedRoomId === 'kitchen' ? styles.navItemActive : ''}`}
                onClick={() => handleRoomClick('kitchen')}
              >
                <Utensils size={18} />
                <span>Kitchen</span>
              </button>
            )}

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${selectedRoomId === 'bedroom' ? styles.navItemActive : ''}`}
                onClick={() => handleRoomClick('bedroom')}
              >
                <Bed size={18} />
                <span>Bedroom</span>
              </button>
            )}

            {/* Sensors (Available to Visitor & Admin) */}
            <button
              type="button"
              className={`${styles.navItem} ${isSensors ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick('SENSORS')}
            >
              <Activity size={18} />
              <span>Sensors</span>
            </button>

            {/* Connections */}
            <button
              type="button"
              className={`${styles.navItem} ${isConnections ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick('DIAGNOSTICS')}
            >
              <Network size={18} />
              <span>Connections</span>
              {currentMode === 'LOCAL' && <span className={styles.localBadge}>LOCAL</span>}
            </button>

            {!isVisitor && (
              <button
                type="button"
                className={`${styles.navItem} ${isTesting ? styles.navItemActive : ''}`}
                onClick={() => handleNavClick('RESEARCH_TEST')}
              >
                <FlaskConical size={18} />
                <span>Test Lab</span>
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
                <Users size={18} />
                <span>User accounts</span>
              </button>
            )}
          </nav>
        </div>

        {/* 4. Always Close To Home Card */}
        <div className={styles.infoCard}>
          <div className={styles.infoIconCircle}>
            <ShieldCheck size={18} color="#285640" />
          </div>
          <h4 className={styles.infoTitle}>Always close to home.</h4>
          <p className={styles.infoText}>
            Local control and safety alerts stay active over LAN even when Internet drops.
          </p>
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
              title="Sign out of SafeHaven"
            >
              <LogOut size={15} />
              <span>{isSigningOut ? 'Wait...' : 'Sign out'}</span>
            </button>
          </div>
        )}

        {/* 6. System Data Source Footer */}
        <div className={styles.sidebarFooter}>
          <div className={styles.simulatedTag}>
            <span className={styles.greenDot}></span>
            <span>SafeHaven Local-First Engine</span>
          </div>
          <span className={styles.disclaimer}>Source: Simulator · Bridge: Live MQTT</span>
        </div>
      </aside>
    </>
  );
}
