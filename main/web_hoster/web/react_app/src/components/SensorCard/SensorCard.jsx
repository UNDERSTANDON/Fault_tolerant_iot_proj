import { Thermometer, Droplets, Flame, Wifi, AlertCircle } from 'lucide-react';
import styles from './SensorCard.module.css';

export default function SensorCard({ sensor }) {
  const { name, value, unit, type, status } = sensor;

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
          <AlertCircle size={18} className={styles.iconSmoke} />
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
        <span className={styles.sensorName}>{name}</span>
        <span className={styles.sensorValue}>
          {value} {unit ? <span className={styles.unit}>{unit}</span> : null}
        </span>
      </div>
    </div>
  );
}
