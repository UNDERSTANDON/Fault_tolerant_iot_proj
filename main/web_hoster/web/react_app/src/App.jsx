import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import Header from './components/Header/Header';
import ModeBanner from './components/ModeBanner/ModeBanner';
import ConnectionStatus from './components/ConnectionStatus/ConnectionStatus';
import RoomCard from './components/RoomCard/RoomCard';
import RoomDetail from './components/RoomDetail/RoomDetail';
import DashboardBottomRow from './components/DashboardBottomRow/DashboardBottomRow';
import NetworkDiagnostics from './components/NetworkDiagnostics/NetworkDiagnostics';
import LocalFallbackView from './components/LocalFallbackView/LocalFallbackView';
import RecoveryView from './components/RecoveryView/RecoveryView';
import ResearchTestView from './components/ResearchTestView/ResearchTestView';
import Notification from './components/Notification/Notification';
import FaultSimulation from './components/FaultSimulation/FaultSimulation';
import AuthModal from './components/AuthModal/AuthModal';
import UserManagement from './components/UserManagement/UserManagement';
import { useSmartHome } from './hooks/useSmartHome';
import { useAuth } from './hooks/useAuth';
import styles from './App.module.css';

export default function App() {
  const [activeScreen, setActiveScreen] = useState('DASHBOARD');
  // Bug 1 Fix: Mobile Drawer State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const {
    currentUser,
    isAuthenticated,
    authError,
    needsBootstrap,
    settingsError,
    users,
    usersError,
    isLoadingUsers,
    loadUsers,
    createVisitor,
    setVisitorEnabled,
    signIn,
    signOut,
    clearError
  } = useAuth();

  const isLocked = !isAuthenticated;
  const isVisitor = currentUser?.role === 'visitor';

  const {
    rooms,
    networkState,
    bridgeState,
    connectBridge,
    metrics,
    selectedRoomId,
    setSelectedRoomId,
    isSmokeAlert,
    toggleSmokeAlarm,
    recentActivity,
    experimentLogs,
    notifications,
    dismissNotification,
    toggleDevice,
    triggerFault,
    restoreNormal
  } = useSmartHome();

  useEffect(() => {
    if (isVisitor) {
      setActiveScreen('DIAGNOSTICS');
      setSelectedRoomId(null);
    }
  }, [isVisitor, setSelectedRoomId]);

  const isSystemUnavailable = networkState.mode === 'UNAVAILABLE';
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  // Return to Dashboard handler
  const handleBackToDashboard = () => {
    setActiveScreen(isVisitor ? 'DIAGNOSTICS' : 'DASHBOARD');
    setSelectedRoomId(null);
  };

  const handleSignOut = () => {
    signOut();
    setSelectedRoomId(null);
    setIsMobileMenuOpen(false);
    setActiveScreen('DASHBOARD');
  };

  const getScreenTitle = () => {
    switch (activeScreen) {
      case 'DIAGNOSTICS': return 'Connections';
      case 'LOCAL_FALLBACK': return 'Local Fallback';
      case 'RECOVERY': return 'Cloud Sync';
      case 'RESEARCH_TEST': return 'Testing';
      case 'USERS': return 'User accounts';
      case 'DASHBOARD':
      default:
        return 'Overview';
    }
  };

  return (
    <>
      <div
        className={`${styles.appContainer} ${isLocked ? styles.appLocked : ''}`}
        inert={isLocked}
        aria-hidden={isLocked}
      >
        {/* Toast Notification System (Global) */}
        <Notification
          notifications={notifications}
          onDismiss={dismissNotification}
        />

        {/* 1. Left Sidebar Navigation (Matching Nest Reference Figma) */}
        <Sidebar
          activeScreen={activeScreen}
          onSelectScreen={setActiveScreen}
          onSelectRoom={setSelectedRoomId}
          selectedRoomId={selectedRoomId}
          currentMode={networkState.mode}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          onManageUsers={() => setActiveScreen('USERS')}
        />

      {/* 2. Main Content Canvas */}
      <div className={styles.mainWrapper}>
        {/* Top Breadcrumb & Header with Live Clock & Mobile Hamburger */}
        <Header
          networkMode={networkState.mode}
          activeScreenName={getScreenTitle()}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />
        {settingsError && <div className={styles.inlineError} role="alert">{settingsError}</div>}

        {/* Dynamic Screen Routing */}
        {!isVisitor && activeScreen === 'DASHBOARD' && (
          <main>
            {/* 4-Channel Status Card */}
            <ConnectionStatus
              networkState={networkState}
              bridgeState={bridgeState}
              onConnectBridge={connectBridge}
            />

            {/* Contextual Mode Banner */}
            <ModeBanner
              networkState={networkState}
              onNavigateToConnections={() => setActiveScreen('LOCAL_FALLBACK')}
            />

            {/* Section: Your spaces */}
            <section>
              <div className={styles.spacesHeader}>
                <h2 className={styles.spacesTitle}>Your spaces</h2>
                <span className={styles.spacesMeta}>Room sensors · Simulated values, not hardware readings</span>
              </div>

              <div className={styles.spacesGrid}>
                {rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onToggleDevice={toggleDevice}
                    isSystemUnavailable={isSystemUnavailable}
                    onSelectRoom={setSelectedRoomId}
                  />
                ))}
              </div>
            </section>

            {/* Bottom Row: Dynamic Recent Activity & Local Connection First */}
            <DashboardBottomRow
              networkMode={networkState.mode}
              onNavigateToConnections={() => setActiveScreen('DIAGNOSTICS')}
              recentActivity={recentActivity}
            />
          </main>
        )}

        {/* SCREEN S3: Network & Channel Diagnostics */}
        {activeScreen === 'DIAGNOSTICS' && (
          <NetworkDiagnostics
            networkState={networkState}
            bridgeState={bridgeState}
            onBackToDashboard={handleBackToDashboard}
          />
        )}

        {/* SCREEN S4: Local Fallback Architecture */}
        {!isVisitor && activeScreen === 'LOCAL_FALLBACK' && (
          <LocalFallbackView
            networkState={networkState}
            rooms={rooms}
            onToggleDevice={toggleDevice}
            onBackToDashboard={handleBackToDashboard}
          />
        )}

        {/* SCREEN S5: Cloud Reconnection & Sync */}
        {!isVisitor && activeScreen === 'RECOVERY' && (
          <RecoveryView
            networkState={networkState}
            onBackToDashboard={handleBackToDashboard}
            onResetDemo={restoreNormal}
          />
        )}

        {/* SCREEN S6: Research Experiment Laboratory (Bug 3 Fixed: dynamic experimentLogs) */}
        {!isVisitor && activeScreen === 'RESEARCH_TEST' && (
          <ResearchTestView
            networkState={networkState}
            metrics={metrics}
            onTriggerFault={triggerFault}
            onRestore={restoreNormal}
            onBackToDashboard={handleBackToDashboard}
            isSmokeAlert={isSmokeAlert}
            onToggleSmokeAlarm={toggleSmokeAlarm}
            experimentLogs={experimentLogs}
          />
        )}

        {activeScreen === 'USERS' && currentUser?.role === 'admin' && (
          <UserManagement
            users={users}
            usersError={usersError}
            isLoadingUsers={isLoadingUsers}
            onLoadUsers={loadUsers}
            onCreateVisitor={createVisitor}
            onSetVisitorEnabled={setVisitorEnabled}
          />
        )}
      </div>

      {/* SCREEN S2: Room Detail View (Modal Overlay accessible from any card or sidebar) */}
      {!isVisitor && selectedRoom && (
        <RoomDetail
          room={selectedRoom}
          onClose={() => setSelectedRoomId(null)}
          onToggleDevice={toggleDevice}
          isSystemUnavailable={isSystemUnavailable}
          networkMode={networkState.mode}
        />
      )}

        {/* Persistent Fault Simulation Drawer Bar */}
        {!isVisitor && (
          <FaultSimulation
            currentMode={networkState.mode}
            onTriggerFault={triggerFault}
            onRestore={restoreNormal}
            metrics={metrics}
            isSmokeAlert={isSmokeAlert}
            onToggleSmokeAlarm={toggleSmokeAlarm}
          />
        )}
      </div>

      {/* Mandatory Non-Dismissible Auth Gate Modal */}
      {isLocked && (
        <AuthModal
          authError={authError}
          needsBootstrap={needsBootstrap}
          onSignIn={signIn}
          onClearError={clearError}
        />
      )}
    </>
  );
}
