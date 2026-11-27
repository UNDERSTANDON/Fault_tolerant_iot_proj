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
import SettingsView from './components/SettingsView/SettingsView';
import NotificationHistoryView from './components/NotificationHistoryView/NotificationHistoryView';
import Notification from './components/Notification/Notification';
import FaultSimulation from './components/FaultSimulation/FaultSimulation';
import AuthModal from './components/AuthModal/AuthModal';
import UserManagement from './components/UserManagement/UserManagement';
import SplashScreen from './components/SplashScreen/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { useSmartHome } from './hooks/useSmartHome';
import { useAuth } from './hooks/useAuth';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { SUPPORTED_LANGUAGES } from './i18n/translations';
import styles from './App.module.css';

const SPLASH_SESSION_KEY = 'safehaven_splash_seen_v1';

function AppShell({ auth, smartHome, showSplash }) {
  const { t, translateSource } = useLanguage();
  const [activeScreen, setActiveScreen] = useState('DASHBOARD');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
  } = auth;

  const {
    rooms,
    networkState,
    deviceNetworkStatus,
    hardwareStatus,
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
    notificationHistory,
    historyMeta,
    addNotification,
    dismissNotification,
    deleteNotificationHistoryItem,
    clearAllNotificationHistory,
    cleanupExpiredNotifications,
    toggleDevice,
    triggerFault,
    restoreNormal,
    resetSystemState
  } = smartHome;

  const isLocked = !isAuthenticated;
  const isVisitor = currentUser?.role === 'visitor';
  const effectiveScreen =
    isVisitor
      && activeScreen !== 'SENSORS'
      && activeScreen !== 'DIAGNOSTICS'
      && activeScreen !== 'SETTINGS'
      && activeScreen !== 'NOTIFICATION_HISTORY'
      ? 'SENSORS'
      : activeScreen;

  const selectedRoom = !isVisitor ? rooms.find((r) => r.id === selectedRoomId) || null : null;
  const isSystemUnavailable = networkState.mode === 'UNAVAILABLE';

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

  const handleNotifyPreferenceChange = (kind, nextValue) => {
    if (kind === 'language') {
      const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === nextValue);
      addNotification({
        type: 'success',
        titleKey: 'notifications.langChangedTitle',
        messageKey: 'notifications.langChangedMsg',
        params: { lang: langMeta ? `${langMeta.nativeName} (${langMeta.name})` : nextValue }
      });
    } else if (kind === 'theme') {
      addNotification({
        type: 'info',
        titleKey: 'notifications.themeChangedTitle',
        messageKey: 'notifications.themeChangedMsg',
        params: {
          themeKey: nextValue === 'dark' ? 'settings.darkModeTitle' : 'settings.lightModeTitle'
        }
      });
    }
  };

  const getScreenTitle = () => {
    switch (effectiveScreen) {
      case 'SENSORS': return t('header.envSensors');
      case 'DIAGNOSTICS': return t('header.connections');
      case 'LOCAL_FALLBACK': return t('header.localFallback');
      case 'RECOVERY': return t('header.cloudSync');
      case 'RESEARCH_TEST': return t('header.testLab');
      case 'USERS': return t('header.userAccounts');
      case 'NOTIFICATION_HISTORY': return t('header.notificationHistory');
      case 'SETTINGS': return t('header.settings');
      case 'DASHBOARD':
      default:
        return t('header.homeOverview');
    }
  };

  const isSplashActive = showSplash || isCheckingSession;

  return (
    <>
      {isSplashActive && (
        <SplashScreen
          statusText={
            isCheckingSession
              ? t('splash.verifyingSession')
              : t('splash.initializingGateway')
          }
        />
      )}

      <div
        className={`${styles.appContainer} ${isLocked ? styles.appLocked : ''}`}
        inert={isLocked || isSplashActive}
        aria-hidden={isLocked || isSplashActive}
      >
        <Notification
          notifications={notifications}
          onDismiss={dismissNotification}
        />

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
          hardwareStatus={hardwareStatus}
          bridgeState={bridgeState}
          notificationCount={notificationHistory.length}
        />

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
            onQuickThemeToggle={(nextTheme) => handleNotifyPreferenceChange('theme', nextTheme)}
            notificationCount={notificationHistory.length}
          />
          {settingsError && <div className={styles.inlineError} role="alert">{settingsError}</div>}

          <ErrorBoundary onReset={handleBackToDashboard}>
            {!isVisitor && effectiveScreen === 'DASHBOARD' && (
              <main>
                <ConnectionStatus
                  networkState={networkState}
                  deviceNetworkStatus={deviceNetworkStatus}
                  hardwareStatus={hardwareStatus}
                  bridgeState={bridgeState}
                  onConnectBridge={connectBridge}
                />

                <ModeBanner
                  networkState={networkState}
                  hardwareStatus={hardwareStatus}
                  onNavigateToConnections={() => setActiveScreen('DIAGNOSTICS')}
                />

                <section>
                  <div className={styles.spacesHeader}>
                    <h2 className={styles.spacesTitle}>{t('dashboard.yourSpaces')}</h2>
                    <span className={styles.spacesMeta}>
                      {t('dashboard.updatedAt', { time: networkState.lastUpdated })} · {t('common.source')}: {translateSource(hardwareStatus?.dataSource)}
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

            {effectiveScreen === 'SENSORS' && (
              <SensorsView
                rooms={rooms}
                networkState={networkState}
                isVisitor={isVisitor}
              />
            )}

            {effectiveScreen === 'DIAGNOSTICS' && (
              <NetworkDiagnostics
                networkState={networkState}
                hardwareStatus={hardwareStatus}
                bridgeState={bridgeState}
                onBackToDashboard={handleBackToDashboard}
                onSelectScreen={setActiveScreen}
                isVisitor={isVisitor}
              />
            )}

            {!isVisitor && effectiveScreen === 'LOCAL_FALLBACK' && (
              <LocalFallbackView
                networkState={networkState}
                hardwareStatus={hardwareStatus}
                rooms={rooms}
                onToggleDevice={toggleDevice}
                onBackToDashboard={handleBackToDashboard}
              />
            )}

            {!isVisitor && effectiveScreen === 'RECOVERY' && (
              <RecoveryView
                networkState={networkState}
                hardwareStatus={hardwareStatus}
                recentActivity={recentActivity}
                onBackToDashboard={handleBackToDashboard}
                onTriggerSync={restoreNormal}
                onResetDemo={restoreNormal}
              />
            )}

            {!isVisitor && effectiveScreen === 'RESEARCH_TEST' && (
              <ResearchTestView
                networkState={networkState}
                hardwareStatus={hardwareStatus}
                metrics={metrics}
                onTriggerFault={triggerFault}
                onRestore={restoreNormal}
                onBackToDashboard={handleBackToDashboard}
                isSmokeAlert={isSmokeAlert}
                onToggleSmokeAlarm={toggleSmokeAlarm}
                experimentLogs={experimentLogs}
              />
            )}

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

            {effectiveScreen === 'NOTIFICATION_HISTORY' && (
              <NotificationHistoryView
                notificationHistory={notificationHistory}
                historyMeta={historyMeta}
                isVisitor={isVisitor}
                onDeleteItem={deleteNotificationHistoryItem}
                onClearAll={clearAllNotificationHistory}
                onRunCleanup={cleanupExpiredNotifications}
              />
            )}

            {effectiveScreen === 'SETTINGS' && (
              <SettingsView onNotifyPreferenceChange={handleNotifyPreferenceChange} />
            )}
          </ErrorBoundary>
        </div>

        {!isVisitor && selectedRoom && (
          <RoomDetail
            room={selectedRoom}
            onClose={() => setSelectedRoomId(null)}
            onToggleDevice={toggleDevice}
            isSystemUnavailable={isSystemUnavailable}
            networkMode={networkState.mode}
          />
        )}

        {!isVisitor && (
          <FaultSimulation
            currentMode={networkState.mode}
            hardwareStatus={hardwareStatus}
            onTriggerFault={triggerFault}
            onRestore={restoreNormal}
            metrics={metrics}
            isSmokeAlert={isSmokeAlert}
            onToggleSmokeAlarm={toggleSmokeAlarm}
          />
        )}
      </div>

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

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem(SPLASH_SESSION_KEY);
    } catch {
      return true;
    }
  });

  const auth = useAuth();
  const smartHome = useSmartHome();

  useEffect(() => {
    if (!showSplash) return undefined;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
      } catch {
        // Ignore storage errors
      }
      setShowSplash(false);
    }, 1150);
    return () => clearTimeout(timer);
  }, [showSplash]);

  return (
    <LanguageProvider externalPreferences={auth.preferences} onSyncPreferences={auth.saveSettings}>
      <AppShell auth={auth} smartHome={smartHome} showSplash={showSplash} />
    </LanguageProvider>
  );
}
