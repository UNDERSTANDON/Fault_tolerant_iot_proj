import { Lightbulb, Fan, Lock, Unlock, BatteryCharging } from 'lucide-react';
import styles from './DeviceControl.module.css';

export default function DeviceControl({ device, onToggle, disabled }) {
  const { id, name, type, state, value, unit } = device;

  const isSwitchable = type === 'light' || type === 'fan' || type === 'lock';
  const isOn = state === true || state === 'UNLOCKED';

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

  const getShortName = () => {
    if (type === 'light') return 'Light';
    if (type === 'fan') return 'Fan';
    if (type === 'lock') return 'Lock';
    return name;
  };

  const getStateText = () => {
    if (type === 'lock') return state === 'LOCKED' ? 'LOCKED' : 'UNLOCKED';
    if (type === 'ups') return `${value} (${unit})`;
    return isOn ? 'ON' : 'OFF';
  };

  return (
    <div className={`${styles.innerCard} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.leftMeta}>
        <div className={styles.iconWrap}>
          {getDeviceIcon()}
        </div>
        <div className={styles.textWrap}>
          <span className={styles.nameLabel}>{getShortName()}</span>
          <span className={`${styles.stateLabel} ${isOn ? styles.stateLabelOn : ''}`}>
            {getStateText()}
          </span>
        </div>
      </div>

      {isSwitchable && (
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          className={`${styles.toggleTrack} ${isOn ? styles.trackOn : styles.trackOff}`}
          onClick={() => !disabled && onToggle(id, !isOn)}
          disabled={disabled}
          title={`Click to turn ${isOn ? 'OFF' : 'ON'}`}
          aria-label={`Toggle ${name}`}
        >
          <span className={`${styles.toggleThumb} ${isOn ? styles.thumbOn : styles.thumbOff}`}></span>
        </button>
      )}
    </div>
  );
}
