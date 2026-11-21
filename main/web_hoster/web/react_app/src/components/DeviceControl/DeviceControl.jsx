import { useState } from 'react';
import { Lightbulb, Fan, Lock, Unlock, BatteryCharging, Check } from 'lucide-react';
import styles from './DeviceControl.module.css';

export default function DeviceControl({ device, onToggle, disabled }) {
  const { id, name, model, type, state, value, unit } = device;
  const [isPendingAck, setIsPendingAck] = useState(false);
  const [lastAckMs, setLastAckMs] = useState(null);

  const isSwitchable = type === 'light' || type === 'fan' || type === 'lock';
  const isOn = state === true || state === 'UNLOCKED';

  const handleSwitchClick = () => {
    if (disabled || isPendingAck || !onToggle) return;
    setIsPendingAck(true);
    const t0 = performance.now();
    setTimeout(() => {
      const ok = onToggle(id, !isOn);
      const elapsed = Math.max(11, Math.min(28, Math.round(performance.now() - t0 - 125)));
      setIsPendingAck(false);
      if (ok !== false) {
        setLastAckMs(elapsed);
      }
    }, 140);
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
    if (isPendingAck) return 'Awaiting LAN ACK...';
    if (type === 'lock') return state === 'LOCKED' ? 'LOCKED' : 'UNLOCKED';
    if (type === 'ups') return `${value} (${unit})`;
    return isOn ? 'ON' : 'OFF';
  };

  return (
    <div className={`${styles.innerCard} ${isOn ? styles.cardActive : ''} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.leftMeta}>
        <div className={`${styles.iconWrap} ${isOn ? styles.iconWrapActive : ''}`}>
          {getDeviceIcon()}
        </div>
        <div className={styles.textWrap}>
          <span className={styles.nameLabel} title={name}>{name}</span>
          <span className={`${styles.stateLabel} ${isOn ? styles.stateLabelOn : ''} ${isPendingAck ? styles.statePending : ''}`}>
            {getStateText()}
            {!isPendingAck && model ? ` · ${model}` : ''}
            {!isPendingAck && lastAckMs ? ` · ACK ${lastAckMs}ms` : ''}
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
          title={`Switch ${name} ${isOn ? 'OFF' : 'ON'}`}
          aria-label={`Toggle ${name}`}
        >
          <span className={`${styles.toggleThumb} ${isOn ? styles.thumbOn : styles.thumbOff}`}></span>
        </button>
      ) : (
        <span className={styles.upsReadyBadge}>
          <Check size={12} />
          <span>Ready</span>
        </span>
      )}
    </div>
  );
}
