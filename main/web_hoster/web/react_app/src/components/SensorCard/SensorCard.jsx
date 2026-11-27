import { Thermometer, Droplets, Flame, Wifi, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './SensorCard.module.css';

export default function SensorCard({ sensor, showSource = false }) {
  const { t, translateSensorValue, translateSensorStatus, translateSource } = useLanguage();
  const { id, name, model, value, unit, type, status = 'NO DATA', source = 'No Data (ESP32-S3)' } = sensor;

  const displayName = id && t(`sensors.${id}`) !== `sensors.${id}` ? t(`sensors.${id}`) : name;
  const displayValue = translateSensorValue(value);
  const displayStatus = translateSensorStatus(status);
  const displaySource = translateSource(source);

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
  const isWarn = status === 'PREHEATING' || status === 'STANDBY' || status === 'NO DATA' || status === 'OFFLINE';
  const pillClass = isAlert ? styles.pillAlert : isWarn ? styles.pillWarn : styles.pillNormal;
  const showUnit = Boolean(unit) && typeof value === 'number';

  return (
    <div className={`${styles.badge} ${isAlert ? styles.badgeAlert : ''}`}>
      <div className={styles.leftGroup}>
        <div className={styles.iconWrapper}>
          {getSensorIcon()}
        </div>
        <div className={styles.metaStack}>
          <div className={styles.nameLine}>
            <span className={styles.sensorName}>{displayName}</span>
            {model && <span className={styles.modelTag}>{model}</span>}
          </div>
          <span className={styles.subMeta}>
            {type === 'temperature' && t('sensors.tempMeta')}
            {type === 'humidity' && t('sensors.humidityMeta')}
            {type === 'smoke' && t('sensors.smokeMeta')}
            {type === 'gateway' && t('sensors.gatewayMeta')}
            {showSource ? ` · ${t('common.source')}: ${displaySource}` : ''}
          </span>
        </div>
      </div>

      <div className={styles.rightGroup}>
        <span className={`${typeof value === 'number' ? styles.sensorValue : styles.sensorValueText} ${isAlert ? styles.valueAlert : ''}`}>
          {displayValue}{showUnit ? <span className={styles.unit}> {unit}</span> : null}
        </span>
        <span className={`${styles.statusPill} ${pillClass}`}>
          {displayStatus}
        </span>
      </div>
    </div>
  );
}
