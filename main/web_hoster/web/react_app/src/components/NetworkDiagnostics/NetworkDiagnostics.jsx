import { useState } from 'react';
import { ArrowLeft, Cpu, Globe, Network, Radio, Server, RefreshCw, Wifi, ShieldCheck, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './NetworkDiagnostics.module.css';

export default function NetworkDiagnostics({
  networkState,
  hardwareStatus,
  bridgeState = { status: 'not-configured', lastMessageAt: null, lastMessage: null, messageStale: false, error: null },
  onBackToDashboard,
  onSelectScreen,
  isVisitor = false
}) {
  const { t, locale, translateSource } = useLanguage();
  const [pingKey, setPingKey] = useState(null);
  const [isPinging, setIsPinging] = useState(false);

  const isBridgeConnected = bridgeState?.status === 'connected';
  const isEspLive = Boolean(hardwareStatus?.isLive);
  const isLanActive = Boolean(isBridgeConnected || isEspLive);
  const lastTelemetryTime = hardwareStatus?.lastTelemetryAt
    ? new Date(hardwareStatus.lastTelemetryAt).toLocaleString(locale)
    : (bridgeState?.lastMessageAt ? new Date(bridgeState.lastMessageAt).toLocaleString(locale) : t('diagnostics.noPacketReceived'));

  const getBridgeBadge = (status) => {
    switch (status) {
      case 'not-configured': return t('connectionStatus.bridgeStandby');
      case 'connecting': return t('connectionStatus.bridgeConnecting');
      case 'connected': return t('connectionStatus.bridgeConnected');
      case 'reconnecting': return t('connectionStatus.bridgeReconnecting');
      case 'unavailable': return t('connectionStatus.bridgeUnavailable');
      case 'unauthorized': return t('connectionStatus.bridgeAuthReq');
      default: return t('common.standby');
    }
  };

  const getLastMessageLabel = () => {
    if (!bridgeState?.lastMessageAt) {
      return t('diagnostics.listeningPackets');
    }
    return bridgeState.messageStale ? t('diagnostics.stalePackets') : t('diagnostics.livePacketVerified');
  };

  const handleRunPing = () => {
    setIsPinging(true);
    setPingKey('start');
    setTimeout(() => {
      setIsPinging(false);
      if (isEspLive) {
        setPingKey('live');
      } else if (isBridgeConnected) {
        setPingKey('bridgeOnly');
      } else {
        setPingKey('noData');
      }
    }, 350);
  };

  const renderPingResult = () => {
    if (pingKey === 'start') return t('diagnostics.probeStart');
    if (pingKey === 'live') return t('diagnostics.probeLive', { source: translateSource(hardwareStatus?.dataSource) });
    if (pingKey === 'bridgeOnly') return t('diagnostics.probeBridgeOnly');
    if (pingKey === 'noData') return t('diagnostics.probeNoData');
    return '';
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
        >
          <ArrowLeft size={18} />
          <span>{isVisitor ? t('common.backToSensors') : t('common.backToOverview')}</span>
        </button>

        <div className={styles.screenTag}>
          {t('diagnostics.screenTag')}
        </div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>{t('diagnostics.title')}</h2>
        <p className={styles.subtitle}>{t('diagnostics.subtitle')}</p>
      </div>

      {/* Topology Nodes Grid */}
      <div className={styles.topologyGrid}>
        {/* Node 1: Cloud Route */}
        <div className={`${styles.nodeCard} ${networkState?.internet ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Globe size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {networkState?.internet ? t('common.online') : t('common.offline')}
            </span>
          </div>
          <h3 className={styles.nodeName}>{t('diagnostics.node1Title')}</h3>
          <p className={styles.nodeDesc}>{t('diagnostics.node1Desc')}</p>
          <div className={styles.nodeMeta}>
            <span>{t('diagnostics.stateLabel')}: <strong>{networkState?.internet ? t('diagnostics.browserOnline') : t('common.offline')}</strong></span>
            <span>{t('common.source')}: <code>{t('diagnostics.browserStatus')}</code></span>
          </div>
        </div>

        {/* Node 2: Domestic Router / LAN */}
        <div className={`${styles.nodeCard} ${isLanActive ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Network size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {isLanActive ? t('common.connected') : t('diagnostics.noLink')}
            </span>
          </div>
          <h3 className={styles.nodeName}>{t('diagnostics.node2Title')}</h3>
          <p className={styles.nodeDesc}>{t('diagnostics.node2Desc')}</p>
          <div className={styles.nodeMeta}>
            <span>{t('diagnostics.stateLabel')}: <strong>{isLanActive ? t('diagnostics.bridgeReachable') : t('connectionStatus.noGatewayLink')}</strong></span>
            <span>{t('common.source')}: <code>{t('diagnostics.lanProbe')}</code></span>
          </div>
        </div>

        {/* Node 3: ESP32-S3 Edge Gateway */}
        <div className={`${styles.nodeCard} ${isEspLive ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Cpu size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {isEspLive ? t('common.online') : t('common.noDataStatus')}
            </span>
          </div>
          <h3 className={styles.nodeName}>{t('diagnostics.node3Title')}</h3>
          <p className={styles.nodeDesc}>{t('diagnostics.node3Desc')}</p>
          <div className={styles.nodeMeta}>
            <span>{t('diagnostics.telemetryLabel')}: <strong>{isEspLive ? t('diagnostics.streamingLive') : t('diagnostics.noDataReceived')}</strong></span>
            <span>{t('common.source')}: <code>{translateSource(hardwareStatus?.dataSource)}</code></span>
          </div>
        </div>

        {/* Node 4: MQTT Broker via Local Bridge */}
        <div className={`${styles.nodeCard} ${isBridgeConnected ? styles.nodeHealthy : styles.nodeDown}`}>
          <div className={styles.nodeHeader}>
            <Radio size={22} className={styles.nodeIcon} />
            <span className={styles.nodeBadge}>
              {getBridgeBadge(bridgeState?.status)}
            </span>
          </div>
          <h3 className={styles.nodeName}>{t('diagnostics.node4Title')}</h3>
          <p className={styles.nodeDesc}>{t('diagnostics.node4Desc')}</p>
          <div className={styles.nodeMeta}>
            <span>{t('diagnostics.packetStatus')}: <strong>{isEspLive ? t('diagnostics.liveTelemetryActive') : getLastMessageLabel()}</strong></span>
            <span>{t('diagnostics.lastPacket')}: <code>{lastTelemetryTime}</code></span>
            {bridgeState?.lastMessage && (
              <span>{t('diagnostics.sequence')}: <code>#{bridgeState.lastMessage.sequence}</code></span>
            )}
            <span>{t('common.source')}: <code>{t('common.liveMqtt')}</code></span>
          </div>
        </div>
      </div>

      {/* Benchmark & Live Connectivity Probe */}
      <div className={styles.diagnosticToolCard}>
        <div className={styles.toolHeader}>
          <div className={styles.toolTitleGroup}>
            <Server size={20} className={styles.toolIcon} />
            <div>
              <h3 className={styles.toolTitle}>{t('diagnostics.toolTitle')}</h3>
              <p className={styles.toolSubtitle}>{t('diagnostics.toolSubtitle')}</p>
            </div>
          </div>

          <button
            type="button"
            className={styles.pingButton}
            onClick={handleRunPing}
            disabled={isPinging}
          >
            <RefreshCw size={16} className={isPinging ? styles.spin : ''} />
            <span>{isPinging ? t('diagnostics.probingLinks') : t('diagnostics.runLinkProbe')}</span>
          </button>
        </div>

        {pingKey && (
          <div className={styles.pingConsole} role="status" aria-live="polite">
            <span className={styles.consolePrompt}>$ safehaven-probe --gateway</span>
            <span className={styles.consoleResult}>{renderPingResult()}</span>
          </div>
        )}

        <div className={styles.specsRow}>
          <div className={styles.specItem}>
            <Radio size={16} />
            <span>{t('diagnostics.bridgeStatusLabel')}: <strong>{getBridgeBadge(bridgeState?.status)}</strong></span>
          </div>
          <div className={styles.specItem}>
            <Wifi size={16} />
            <span>{t('diagnostics.espStreamLabel')}: <strong>{isEspLive ? t('diagnostics.live2500ms') : t('diagnostics.noDataReceived')}</strong></span>
          </div>
          <div className={styles.specItem}>
            <ShieldCheck size={16} />
            <span>{t('diagnostics.failoverTargetLabel')}: <strong>{t('diagnostics.failoverTargetVal')}</strong></span>
          </div>
        </div>

        {!isVisitor && onSelectScreen && (
          <div className={styles.specsRow}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => onSelectScreen('LOCAL_FALLBACK')}
            >
              <AlertCircle size={15} />
              <span>{t('diagnostics.openS4Btn')}</span>
            </button>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => onSelectScreen('RECOVERY')}
            >
              <RefreshCw size={15} />
              <span>{t('diagnostics.openS5Btn')}</span>
            </button>
          </div>
        )}

        {bridgeState?.error && bridgeState.status !== 'not-configured' && (
          <div className={styles.pingConsole} role="status" aria-live="polite">
            <span className={styles.bridgeError}>{bridgeState.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
