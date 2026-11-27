import { useState } from 'react';
import { Lightbulb, Fan, Lock, Unlock, BatteryCharging, Check } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './DeviceControl.module.css';

export default function DeviceControl({ device, onToggle, disabled }) {
  const { t } = useLanguage();
  const { id, name, model, type, state, value, unit } = device;
  const [isPendingAck, setIsPendingAck] = useState(false);
  const [lastAckMs, setLastAckMs] = useState(null);

  const isSwitchable = type === 'light' || type === 'fan' || type === 'lock';
  const isOn = state === true || state === 'UNLOCKED';
  const displayName = t(`devices.${id}`) !== `devices.${id}` ? t(`devices.${id}`) : name;

  const handleSwitchClick = async () => {
    if (disabled || isPendingAck || !onToggle) return;
    setIsPendingAck(true);
    const t0 = performance.now();
    try {
      const result = await Promise.resolve(onToggle(id, !isOn));
      const elapsed = typeof result === 'object' && result !== null && typeof result.latencyMs === 'number'
        ? result.latencyMs
        : Math.max(11, Math.round(performance.now() - t0));
      const ok = typeof result === 'object' && result !== null ? result.ok !== false : result !== false;
      if (ok) {
        setLastAckMs(elapsed);
      }
    } finally {
      setIsPendingAck(false);
    }
  };

  const getDeviceIcon = () => {
    switch (type) {
      case 'light':
        return <Lightbulb size={18} className={isOn ? styles.iconOn : styles.iconOff} />;
      case 'fan':
        return <Fan size={18} className={`${isOn ? styles.fanSpinning : ''} ${isOn ? styles.iconOn : styles.iconOff}`} />;
      case 'lock':
        return isOn ? <Unlock size={18} className={styles.iconOn} /> : <Lock size={18} className={styles.iconOff} />;
      case 'ups':
      default:
        return <BatteryCharging size={18} className={styles.iconUps} />;
    }
  };

  const getStateText = () => {
    if (isPendingAck) return t('common.awaitingAck');
    if (type === 'lock') return state === 'LOCKED' ? t('common.locked') : t('common.unlocked');
    if (type === 'ups') return `${value} (${unit})`;
    return isOn ? t('common.on') : t('common.off');
  };

  return (
    <div className={`${styles.innerCard} ${isOn ? styles.cardActive : ''} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.leftMeta}>
        <div className={`${styles.iconWrap} ${isOn ? styles.iconWrapActive : ''}`}>
          {getDeviceIcon()}
        </div>
        <div className={styles.textWrap}>
          <span className={styles.nameLabel} title={displayName}>{displayName}</span>
          <span className={`${styles.stateLabel} ${isOn ? styles.stateLabelOn : ''} ${isPendingAck ? styles.statePending : ''}`}>
            {getStateText()}
            {!isPendingAck && model ? ` · ${model}` : ''}
            {!isPendingAck && lastAckMs ? ` · ${t('common.ack')} ${lastAckMs}ms` : ''}
          </span>
        </div>
      </div>

      {isSwitchable ? (
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          className={`${styles.toggleTrack} ${isOn ? styles.trackOn : styles.trackOff} ${isPendingAck ? styles.trackPending : ''}`}
          onClick={handleSwitchClick}
          disabled={disabled}
          title={`${displayName}: ${isOn ? t('common.off') : t('common.on')}`}
          aria-label={displayName}
        >
          <span className={`${styles.toggleThumb} ${isOn ? styles.thumbOn : styles.thumbOff}`}></span>
        </button>
      ) : (
        <span className={styles.upsReadyBadge}>
          <Check size={12} />
          <span>{t('common.ready')}</span>
        </span>
      )}
    </div>
  );
}
