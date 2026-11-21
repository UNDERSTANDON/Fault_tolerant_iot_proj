import { Thermometer, Droplets, Flame, Wifi, ShieldCheck } from 'lucide-react';
import styles from './SensorCard.module.css';

export default function SensorCard({ sensor, showSource = false }) {
  const { name, model, value, unit, type, status = 'NORMAL', source = 'Simulator' } = sensor;

  const getSensorIcon = () => {
    switch (type) {
      case 'temperature':
        return <Thermometer size={18} className={styles.iconTemp} />;
      case 'humidity':
        return <Droplets size={18} className={styles.iconHumidity} />;
      case 'smoke':
        return status === 'ALERT' ? (
          <Flame size={18} className={styles.iconAlert} />
        ) : (
          <ShieldCheck size={18} className={styles.iconSmoke} />
        );
      case 'gateway':
      default:
        return <Wifi size={18} className={styles.iconGateway} />;
    }
  };

  const isAlert = status === 'ALERT';

  return (
    <div className={`${styles.badge} ${isAlert ? styles.badgeAlert : ''}`}>
      <div className={styles.leftGroup}>
        <div className={styles.iconWrapper}>
          {getSensorIcon()}
        </div>
        <div className={styles.metaStack}>
          <div className={styles.nameLine}>
            <span className={styles.sensorName}>{name}</span>
            {model && <span className={styles.modelTag}>{model}</span>}
          </div>
          <span className={styles.subMeta}>
            {type === 'temperature' && 'Thermal probe · 20°C–35°C band'}
            {type === 'humidity' && 'Hygrometer · 50%–70% optimal'}
            {type === 'smoke' && 'Photoelectric / gas threshold monitor'}
            {type === 'gateway' && 'Local edge telemetry transceiver'}
            {showSource ? ` · Source: ${source}` : ''}
          </span>
        </div>
      </div>

      <div className={styles.rightGroup}>
        <span className={`${styles.sensorValue} ${isAlert ? styles.valueAlert : ''}`}>
          {value}{unit ? <span className={styles.unit}> {unit}</span> : null}
        </span>
        <span className={`${styles.statusPill} ${isAlert ? styles.pillAlert : styles.pillNormal}`}>
          {isAlert ? 'HAZARD ALERT' : status}
        </span>
      </div>
    </div>
  );
}
