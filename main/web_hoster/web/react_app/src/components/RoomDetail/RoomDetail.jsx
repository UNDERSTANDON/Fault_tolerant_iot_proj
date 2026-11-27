import { useEffect } from 'react';
import { X, Sofa, Utensils, Bed, Compass, ShieldCheck, Thermometer, Droplets, Clock, Activity } from 'lucide-react';
import DeviceControl from '../DeviceControl/DeviceControl';
import SensorCard from '../SensorCard/SensorCard';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './RoomDetail.module.css';

export default function RoomDetail({ room, onClose, onToggleDevice, isSystemUnavailable, networkMode }) {
  const { t, translateSource } = useLanguage();
  useScrollLock(Boolean(room));

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!room) return null;

  const { id, name, description, devices = [], sensors = [] } = room;
  const displayRoomName = t(`rooms.${id}.name`) !== `rooms.${id}.name` ? t(`rooms.${id}.name`) : name;
  const displayRoomDesc = t(`rooms.${id}.description`) !== `rooms.${id}.description` ? t(`rooms.${id}.description`) : description;

  const getRoomIcon = () => {
    switch (id) {
      case 'living_room':
        return <Sofa size={28} className={styles.iconAccent} />;
      case 'kitchen':
        return <Utensils size={28} className={styles.iconAccent} />;
      case 'bedroom':
        return <Bed size={28} className={styles.iconAccent} />;
      case 'hallway':
      default:
        return <Compass size={28} className={styles.iconAccent} />;
    }
  };

  const activeDeviceCount = devices.filter((d) => d.state === true || d.state === 'UNLOCKED').length;
  const tempSensor = sensors.find((s) => s.type === 'temperature');
  const humiditySensor = sensors.find((s) => s.type === 'humidity');
  const rawZoneSource = tempSensor?.source || humiditySensor?.source || sensors[0]?.source || 'No Data (ESP32-S3)';
  const zoneSource = translateSource(rawZoneSource);
  const hasTempNumber = typeof tempSensor?.value === 'number';
  const hasHumidityNumber = typeof humiditySensor?.value === 'number';
  const humidityPercent = hasHumidityNumber ? Math.min(100, Math.max(0, Number(humiditySensor.value))) : 0;
  const tempPercent = hasTempNumber ? Math.min(100, Math.max(0, Math.round(((Number(tempSensor.value) - 15) / 25) * 100))) : 0;

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={displayRoomName}
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBox}>
              {getRoomIcon()}
            </div>
            <div>
              <div className={styles.titleRow}>
                <h2 className={styles.modalTitle}>{displayRoomName}</h2>
                <span className={styles.screenTag}>{t('roomDetail.screenTag')}</span>
              </div>
              <p className={styles.modalDesc}>{displayRoomDesc}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Strip */}
        <div className={styles.statusStrip}>
          <div className={styles.stripItem}>
            <Activity size={16} className={styles.stripIcon} />
            <span>{t('roomDetail.activeDevices')}: <strong>{activeDeviceCount}/{devices.length}</strong></span>
          </div>
          <div className={styles.stripItem}>
            <ShieldCheck size={16} className={styles.stripIcon} />
            <span>
              {t('roomDetail.routingPath')}: <strong>{networkMode === 'LOCAL' ? t('roomDetail.routeLocal') : t('roomDetail.routeCloudLan')}</strong>
            </span>
          </div>
          <div className={styles.stripItem}>
            <span>{t('common.source')}: <strong>{zoneSource}</strong></span>
          </div>
        </div>

        {/* Body Grid */}
        <div className={styles.modalBody}>
          {/* Column 1: Device Controls */}
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>{t('roomDetail.devicesInUse', { count: devices.length })}</h3>
            <div className={styles.deviceList}>
              {devices.map((device) => (
                <DeviceControl
                  key={device.id}
                  device={device}
                  onToggle={onToggleDevice}
                  disabled={isSystemUnavailable || !device.available}
                />
              ))}
            </div>
          </div>

          {/* Column 2: Sensors & Telemetry */}
          {sensors && sensors.length > 0 && (
            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{t('roomDetail.envSensors', { count: sensors.length })}</h3>
              <div className={styles.sensorGrid}>
                {sensors.map((sensor) => (
                  <SensorCard key={sensor.id} sensor={sensor} showSource />
                ))}
              </div>

              {/* Advanced telemetry gauges */}
              <div className={styles.advancedMetrics}>
                {tempSensor && (
                  <div className={styles.metricCard}>
                    <div className={styles.metricHead}>
                      <Thermometer size={16} color="#f97316" />
                      <span>{t('roomDetail.ambientTemp')} · {tempSensor.model || 'DHT11 · GPIO4'}</span>
                    </div>
                    <div className={styles.gaugeContainer}>
                      <div className={styles.gaugeBar}>
                        <div className={styles.gaugeFill} style={{ width: `${tempPercent}%` }}></div>
                      </div>
                      <span className={styles.gaugeLabel}>
                        {hasTempNumber ? `${tempSensor.value} °C · ${t('roomDetail.comfortBand')}` : t('roomDetail.noDataFromEsp')}
                      </span>
                    </div>
                  </div>
                )}

                {humiditySensor && (
                  <div className={styles.metricCard}>
                    <div className={styles.metricHead}>
                      <Droplets size={16} color="#0284c7" />
                      <span>{t('roomDetail.relativeHumidity')} · {humiditySensor.model || 'DHT11 · GPIO4'}</span>
                    </div>
                    <div className={styles.gaugeContainer}>
                      <div className={styles.gaugeBar}>
                        <div className={`${styles.gaugeFill} ${styles.fillHumidity}`} style={{ width: `${humidityPercent}%` }}></div>
                      </div>
                      <span className={styles.gaugeLabel}>
                        {hasHumidityNumber ? `${humiditySensor.value} % · ${t('roomDetail.optimalRange')}` : t('roomDetail.noDataFromEsp')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <div className={styles.footerNote}>
            <Clock size={14} />
            <span>{t('roomDetail.footerMonitoring')} · {t('common.source')}: {zoneSource}</span>
          </div>
          <button type="button" className={styles.backBtn} onClick={onClose}>
            {t('common.backToOverview')}
          </button>
        </div>
      </div>
    </div>
  );
}
