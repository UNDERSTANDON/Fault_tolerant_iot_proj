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
import SensorsView from './components/SensorsView/SensorsView';
import Notification from './components/Notification/Notification';
import FaultSimulation from './components/FaultSimulation/FaultSimulation';
import AuthModal from './components/AuthModal/AuthModal';
import UserManagement from './components/UserManagement/UserManagement';
import SplashScreen from './components/SplashScreen/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { useSmartHome } from './hooks/useSmartHome';
import { useAuth } from './hooks/useAuth';
import styles from './App.module.css';

const SPLASH_SESSION_KEY = 'safehaven_splash_seen_v1';

export default function App() {
  const [activeScreen, setActiveScreen] = useState('DASHBOARD');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem(SPLASH_SESSION_KEY);
    } catch {
      return true;
    }
  });

  const {
    currentUser,
    isAuthenticated,
    authError,
    isCheckingSession,
    isSigningOut,
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

  const {
    rooms,
    networkState,
    deviceNetworkStatus,
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
    restoreNormal,
    resetSystemState
  } = useSmartHome();

  const isLocked = !isAuthenticated;
  const isVisitor = currentUser?.role === 'visitor';
  const effectiveScreen =
    isVisitor && activeScreen !== 'SENSORS' && activeScreen !== 'DIAGNOSTICS'
      ? 'SENSORS'
      : activeScreen;

  // Pre-login splash timer (~1.5s)
  useEffect(() => {
    if (!showSplash) return undefined;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 400 : 1500;

    const timer = setTimeout(() => {
      setShowSplash(false);
      try {
        sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
      } catch {
        // Ignore storage errors
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [showSplash]);

  // Listen for multi-tab sign-out events to reset local dashboard state
  useEffect(() => {
    const handleStorageReset = (event) => {
      if (event.key === 'safehaven_logout_signal') {
        resetSystemState();
        setIsMobileMenuOpen(false);
        setActiveScreen('DASHBOARD');
      }
    };
    window.addEventListener('storage', handleStorageReset);
    return () => window.removeEventListener('storage', handleStorageReset);
  }, [resetSystemState]);

  const isSystemUnavailable = networkState.mode === 'UNAVAILABLE';
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);

  const handleBackToDashboard = () => {
    setActiveScreen(isVisitor ? 'SENSORS' : 'DASHBOARD');
    setSelectedRoomId(null);
  };

  const handleSignIn = async (username, password) => {
    const ok = await signIn(username, password);
    if (ok) {
      connectBridge();
      setSelectedRoomId(null);
      setActiveScreen(username?.trim().toLowerCase() === 'visitor' ? 'SENSORS' : 'DASHBOARD');
    }
    return ok;
  };

  const handleSignOut = async () => {
    await signOut();
    resetSystemState();
    setSelectedRoomId(null);
    setIsMobileMenuOpen(false);
    setActiveScreen('DASHBOARD');
  };

  const getScreenTitle = () => {
    switch (effectiveScreen) {
      case 'SENSORS': return 'Environmental Sensors';
      case 'DIAGNOSTICS': return 'Connections';
      case 'LOCAL_FALLBACK': return 'Local Fallback';
      case 'RECOVERY': return 'Cloud Sync';
      case 'RESEARCH_TEST': return 'Resilience Test Lab';
      case 'USERS': return 'User Accounts';
      case 'DASHBOARD':
      default:
        return 'Overview';
    }
  };

  const isSplashActive = showSplash || isCheckingSession;

  return (
    <>
      {isSplashActive && (
        <SplashScreen
          statusText={
            isCheckingSession
              ? 'Verifying local session & security credentials...'
              : 'Initializing SafeHaven local-first gateway...'
          }
        />
      )}

      <div
        className={`${styles.appContainer} ${isLocked ? styles.appLocked : ''}`}
        inert={isLocked || isSplashActive}
        aria-hidden={isLocked || isSplashActive}
      >
        {/* Toast Notification System */}
        <Notification
          notifications={notifications}
          onDismiss={dismissNotification}
        />

        {/* 1. Left Sidebar Navigation */}
        <Sidebar
          activeScreen={effectiveScreen}
          onSelectScreen={setActiveScreen}
          onSelectRoom={setSelectedRoomId}
          selectedRoomId={selectedRoomId}
          currentMode={networkState.mode}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isSigningOut={isSigningOut}
          onManageUsers={() => setActiveScreen('USERS')}
        />

        {/* 2. Main Content Canvas */}
        <div className={styles.mainWrapper}>
          <Header
            networkMode={networkState.mode}
            activeScreenName={getScreenTitle()}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            currentUser={currentUser}
            onSignOut={handleSignOut}
            isSigningOut={isSigningOut}
            onSelectScreen={(screen) => {
              setSelectedRoomId(null);
              setActiveScreen(screen);
            }}
          />
          {settingsError && <div className={styles.inlineError} role="alert">{settingsError}</div>}

          <ErrorBoundary onReset={handleBackToDashboard}>
            {/* SCREEN S1: Home Overview (Administrator) */}
            {!isVisitor && effectiveScreen === 'DASHBOARD' && (
              <main>
                <ConnectionStatus
                  networkState={networkState}
                  deviceNetworkStatus={deviceNetworkStatus}
                  bridgeState={bridgeState}
                  onConnectBridge={connectBridge}
                />

                <ModeBanner
                  networkState={networkState}
                  onNavigateToConnections={() => setActiveScreen('DIAGNOSTICS')}
                />

                <section>
                  <div className={styles.spacesHeader}>
                    <h2 className={styles.spacesTitle}>Your spaces</h2>
                    <span className={styles.spacesMeta}>
                      Updated at {networkState.lastUpdated} · Source: Simulator
                    </span>
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

                <DashboardBottomRow
                  networkMode={networkState.mode}
                  onNavigateToConnections={() => setActiveScreen('DIAGNOSTICS')}
                  recentActivity={recentActivity}
                />
              </main>
            )}

            {/* Environmental Sensors View (Visitor Default & Admin View) */}
            {effectiveScreen === 'SENSORS' && (
              <SensorsView
                rooms={rooms}
                networkState={networkState}
                isVisitor={isVisitor}
              />
            )}

            {/* SCREEN S3: Network & Channel Diagnostics */}
            {effectiveScreen === 'DIAGNOSTICS' && (
              <NetworkDiagnostics
                networkState={networkState}
                bridgeState={bridgeState}
                onBackToDashboard={handleBackToDashboard}
                onSelectScreen={setActiveScreen}
                isVisitor={isVisitor}
              />
            )}

            {/* SCREEN S4: Local Fallback Architecture */}
            {!isVisitor && effectiveScreen === 'LOCAL_FALLBACK' && (
              <LocalFallbackView
                networkState={networkState}
                rooms={rooms}
                onToggleDevice={toggleDevice}
                onBackToDashboard={handleBackToDashboard}
              />
            )}

            {/* SCREEN S5: Cloud Reconnection & Sync */}
            {!isVisitor && effectiveScreen === 'RECOVERY' && (
              <RecoveryView
                networkState={networkState}
                onBackToDashboard={handleBackToDashboard}
                onTriggerSync={restoreNormal}
                onResetDemo={restoreNormal}
              />
            )}

            {/* SCREEN S6: Resilience Test Lab */}
            {!isVisitor && effectiveScreen === 'RESEARCH_TEST' && (
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

            {/* User Account Management (Administrator Only) */}
            {effectiveScreen === 'USERS' && currentUser?.role === 'admin' && (
              <UserManagement
                users={users}
                usersError={usersError}
                isLoadingUsers={isLoadingUsers}
                onLoadUsers={loadUsers}
                onCreateVisitor={createVisitor}
                onSetVisitorEnabled={setVisitorEnabled}
              />
            )}
          </ErrorBoundary>
        </div>

        {/* SCREEN S2: Room Detail View Modal (Locks background scroll) */}
        {!isVisitor && selectedRoom && (
          <RoomDetail
            room={selectedRoom}
            onClose={() => setSelectedRoomId(null)}
            onToggleDevice={toggleDevice}
            isSystemUnavailable={isSystemUnavailable}
            networkMode={networkState.mode}
          />
        )}

        {/* Persistent Resilience Test Lab Drawer Bar (Administrator Only) */}
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

      {/* Mandatory Non-Dismissible Auth Gate Modal (Shown after Splash completes) */}
      {!isSplashActive && isLocked && (
        <AuthModal
          authError={authError}
          needsBootstrap={needsBootstrap}
          onSignIn={handleSignIn}
          onClearError={clearError}
        />
      )}
    </>
  );
}
