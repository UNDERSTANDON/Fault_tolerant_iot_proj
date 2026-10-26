import { Home, MapPin, ChevronDown, LayoutGrid, Sofa, Utensils, Bed, Network, FlaskConical, ShieldCheck, X } from 'lucide-react';
import styles from './Sidebar.module.css';

export default function Sidebar({
  activeScreen,
  onSelectScreen,
  onSelectRoom,
  selectedRoomId,
  currentMode,
  isMobileOpen,
  onCloseMobile
}) {
  const isOverview = activeScreen === 'DASHBOARD' && !selectedRoomId;
  const isConnections = (activeScreen === 'DIAGNOSTICS' || activeScreen === 'LOCAL_FALLBACK' || activeScreen === 'RECOVERY') && !selectedRoomId;
  const isTesting = activeScreen === 'RESEARCH_TEST' && !selectedRoomId;

  const handleNavClick = (screenId) => {
    onSelectScreen(screenId);
    if (onCloseMobile) onCloseMobile();
  };

  const handleRoomClick = (roomId) => {
    onSelectRoom(roomId);
    if (onCloseMobile) onCloseMobile();
  };

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

        {/* 1. Nest Branding */}
        <div className={styles.brand}>
          <div className={styles.brandIconBox}>
            <Home size={22} color="#ffffff" strokeWidth={2.2} />
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>nest</span>
            <span className={styles.brandSub}>SMART HOME</span>
          </div>
        </div>

        {/* 2. Apartment Dropdown Card */}
        <div className={styles.apartmentCard}>
          <div className={styles.apartmentLeft}>
            <div className={styles.pinCircle}>
              <MapPin size={15} color="#285640" />
            </div>
            <div className={styles.apartmentMeta}>
              <span className={styles.apartmentTitle}>My apartment</span>
              <span className={styles.apartmentSub}>Three-room apartment</span>
            </div>
          </div>
          <ChevronDown size={14} color="#6b756d" />
        </div>

        {/* 3. Navigation Links (Bug 9 Fixed: dynamic active states) */}
        <div className={styles.navSection}>
          <span className={styles.sectionHeader}>SPACES & CONTROLS</span>

          <nav className={styles.navList}>
            {/* Overview */}
            <button
              type="button"
              className={`${styles.navItem} ${isOverview ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick('DASHBOARD')}
            >
              <LayoutGrid size={18} />
              <span>Overview</span>
            </button>

            {/* Living room */}
            <button
              type="button"
              className={`${styles.navItem} ${selectedRoomId === 'living_room' ? styles.navItemActive : ''}`}
              onClick={() => handleRoomClick('living_room')}
            >
              <Sofa size={18} />
              <span>Living room</span>
            </button>

            {/* Kitchen */}
            <button
              type="button"
              className={`${styles.navItem} ${selectedRoomId === 'kitchen' ? styles.navItemActive : ''}`}
              onClick={() => handleRoomClick('kitchen')}
            >
              <Utensils size={18} />
              <span>Kitchen</span>
            </button>

            {/* Bedroom */}
            <button
              type="button"
              className={`${styles.navItem} ${selectedRoomId === 'bedroom' ? styles.navItemActive : ''}`}
              onClick={() => handleRoomClick('bedroom')}
            >
              <Bed size={18} />
              <span>Bedroom</span>
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

            {/* Testing */}
            <button
              type="button"
              className={`${styles.navItem} ${isTesting ? styles.navItemActive : ''}`}
              onClick={() => handleNavClick('RESEARCH_TEST')}
            >
              <FlaskConical size={18} />
              <span>Testing</span>
            </button>
          </nav>
        </div>

        {/* 4. Always Close To Home Card */}
        <div className={styles.infoCard}>
          <div className={styles.infoIconCircle}>
            <ShieldCheck size={18} color="#285640" />
          </div>
          <h4 className={styles.infoTitle}>Always close to home.</h4>
          <p className={styles.infoText}>
            Local control stays available without Internet.
          </p>
        </div>

        {/* 5. Simulated Data Footer Badge */}
        <div className={styles.sidebarFooter}>
          <div className={styles.simulatedTag}>
            <span className={styles.greenDot}></span>
            <span>Simulated data</span>
          </div>
          <span className={styles.disclaimer}>Sample values · Not real readings</span>
        </div>
      </aside>
    </>
  );
}
