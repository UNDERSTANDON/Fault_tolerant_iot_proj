import { Thermometer, Droplets, Flame, Wifi, ShieldCheck } from 'lucide-react';
import styles from './SensorCard.module.css';

export default function SensorCard({ sensor, showSource = false }) {
  const { name, model, value, unit, type, status, source = 'Simulator' } = sensor;

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
      <div className={styles.iconWrapper}>
        {getSensorIcon()}
      </div>
      <div className={styles.content}>
        <div className={styles.nameRow}>
          <span className={styles.sensorName} title={name}>{name}</span>
          {model && <span className={styles.modelTag}>{model}</span>}
        </div>
        <div className={styles.valueRow}>
          <span className={styles.sensorValue}>
            {value} {unit ? <span className={styles.unit}>{unit}</span> : null}
          </span>
          {showSource && <span className={styles.sourceTag}>Source: {source}</span>}
        </div>
      </div>
    </div>
  );
}
