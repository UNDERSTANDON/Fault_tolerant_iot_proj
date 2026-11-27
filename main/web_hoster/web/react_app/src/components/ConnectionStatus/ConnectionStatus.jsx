import { Globe, Network, Radio, Wifi } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './ConnectionStatus.module.css';

function getStatusClass(status) {
  if (status === 'connected') {
    return styles.valSuccess;
  }
  if (status === 'unavailable' || status === 'unauthorized') {
    return styles.valFailed;
  }
  return styles.valWarn;
}

export default function ConnectionStatus({
  networkState,
  deviceNetworkStatus,
  hardwareStatus,
  bridgeState = { status: 'not-configured' },
  onConnectBridge
}) {
  const { t, locale } = useLanguage();
  const { internet, mqttBroker } = networkState;
  const hasBridgeObj = bridgeState && typeof bridgeState === 'object' && 'lastMessageAt' in bridgeState;
  const isBridgeConnected = bridgeState?.status === 'connected';
  const isEspLive = Boolean(hardwareStatus?.isLive);
  const isLanConnected = Boolean(isBridgeConnected || isEspLive || deviceNetworkStatus?.available);

  const getBridgeLabel = (status) => {
    switch (status) {
      case 'not-configured': return t('connectionStatus.bridgeStandby');
      case 'authentication-required': return t('connectionStatus.bridgeAuthReq');
      case 'unauthorized': return t('connectionStatus.bridgeDenied');
      case 'connecting': return t('connectionStatus.bridgeConnecting');
      case 'connected': return t('connectionStatus.bridgeConnected');
      case 'reconnecting': return t('connectionStatus.bridgeReconnecting');
      case 'unavailable': return t('connectionStatus.bridgeUnavailable');
      default: return t('common.standby');
    }
  };

  const bridgeLabel = hasBridgeObj
    ? getBridgeLabel(bridgeState.status)
    : (mqttBroker && isEspLive ? t('common.connected') : t('common.standby'));

  const espGatewayLabel = isEspLive
    ? t('connectionStatus.onlineSending')
    : deviceNetworkStatus?.available
      ? t('connectionStatus.apActiveNoSensor')
      : t('connectionStatus.noDataDisconnected');

  const lastMessageTime = hardwareStatus?.lastTelemetryAt
    ? new Date(hardwareStatus.lastTelemetryAt).toLocaleTimeString(locale)
    : (hasBridgeObj && bridgeState.lastMessageAt
      ? new Date(bridgeState.lastMessageAt).toLocaleTimeString(locale)
      : null);

  return (
    <div className={styles.channelsCard}>
      {/* 1. Internet */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Globe size={18} className={internet ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>{t('connectionStatus.browserNetwork')}</span>
          <span className={`${styles.value} ${internet ? styles.valSuccess : styles.valFailed}`}>
            {internet ? t('common.online') : t('common.offline')}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 2. Local Network LAN */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Network size={18} className={isLanConnected ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>{t('connectionStatus.localLan')}</span>
          <span className={`${styles.value} ${isLanConnected ? styles.valSuccess : styles.valFailed}`}>
            {isLanConnected ? t('common.connected') : t('connectionStatus.noGatewayLink')}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 3. MQTT Broker / Local Bridge */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Radio size={18} className={isBridgeConnected ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>{t('connectionStatus.mqttBroker')}</span>
          <span className={`${styles.value} ${hasBridgeObj ? getStatusClass(bridgeState.status) : styles.valWarn}`}>
            {bridgeLabel}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 4. ESP32-S3 Gateway */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Wifi size={18} className={isEspLive ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>{t('connectionStatus.espGateway')}</span>
          <span className={`${styles.value} ${isEspLive ? styles.valSuccess : styles.valFailed}`}>
            {espGatewayLabel}
          </span>
          {lastMessageTime && (
            <span className={styles.detail}>{t('connectionStatus.lastTelemetry')} · {lastMessageTime}</span>
          )}
        </div>
      </div>

      {hasBridgeObj && bridgeState.error && bridgeState.status !== 'not-configured' && (
        <p className={styles.bridgeNotice} role="status" aria-live="polite">
          {bridgeState.error}
        </p>
      )}

      {deviceNetworkStatus && (
        <p className={styles.deviceNetworkNotice} role="status" aria-live="polite">
          {deviceNetworkStatus.available
            ? `ESP32-S3 Network · State: ${deviceNetworkStatus.state || 'Unknown'} · Station: ${deviceNetworkStatus.station_connected ? t('common.connected') : t('common.disconnected')} · Fallback AP: ${deviceNetworkStatus.fallback_ap_active ? '192.168.4.1' : t('common.offline')}`
            : deviceNetworkStatus.error}
        </p>
      )}

      {onConnectBridge && hasBridgeObj && ['unauthorized', 'unavailable'].includes(bridgeState.status) && (
        <div className={styles.bridgeAuth}>
          <button type="button" onClick={onConnectBridge}>
            {t('connectionStatus.reconnectBtn')}
          </button>
        </div>
      )}
    </div>
  );
}
