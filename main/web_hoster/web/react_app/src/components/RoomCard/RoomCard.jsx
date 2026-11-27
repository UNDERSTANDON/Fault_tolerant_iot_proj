import { Sofa, Utensils, Bed, Compass, ArrowUpRight, ShieldCheck, Flame, Droplets, Wifi } from 'lucide-react';
import DeviceControl from '../DeviceControl/DeviceControl';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './RoomCard.module.css';

export default function RoomCard({ room, onToggleDevice, isSystemUnavailable, onSelectRoom }) {
  const { t, translateSensorValue } = useLanguage();
  const { id, name, devices = [], sensors = [] } = room;

  const displayRoomName = t(`rooms.${id}.name`) !== `rooms.${id}.name` ? t(`rooms.${id}.name`) : name;

  const getRoomIcon = () => {
    switch (id) {
      case 'living_room':
        return <Sofa size={19} className={styles.iconAccent} />;
      case 'kitchen':
        return <Utensils size={19} className={styles.iconAccent} />;
      case 'bedroom':
        return <Bed size={19} className={styles.iconAccent} />;
      case 'hallway':
      default:
        return <Compass size={19} className={styles.iconAccent} />;
    }
  };

  const getSmallSensorIcon = (sensor) => {
    if (sensor.type === 'humidity') return <Droplets size={13} className={styles.iconHumidity} />;
    if (sensor.type === 'smoke') {
      return sensor.status === 'ALERT' ? (
        <Flame size={13} className={styles.iconAlert} />
      ) : (
        <ShieldCheck size={13} className={styles.iconNormal} />
      );
    }
    return <Wifi size={13} className={styles.iconNormal} />;
  };

  const tempSensor = sensors.find((s) => s.type === 'temperature');
  const smokeSensor = sensors.find((s) => s.type === 'smoke');
  const isSmokeAlert = smokeSensor?.status === 'ALERT';
  const hasTempNumber = typeof tempSensor?.value === 'number';
  const isHardwareLive = Boolean(hasTempNumber || (smokeSensor?.status && smokeSensor.status !== 'NO DATA'));
  const shortSourceLabel = isHardwareLive ? t('common.espLive') : t('common.noData');

  const secondarySensors = tempSensor
    ? sensors.filter((s) => s.id !== tempSensor.id)
    : sensors;

  return (
    <div className={`${styles.cardContainer} ${isSmokeAlert ? styles.cardAlertBorder : ''}`}>
      {/* 1. Header with Icon, Room Name, Counts, and Detail Button */}
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.iconSquare}>
            {getRoomIcon()}
          </div>
          <div className={styles.headerText}>
            <h3 className={styles.roomName}>{displayRoomName}</h3>
            <span className={styles.roomSub}>
              {sensors.length} {sensors.length === 1 ? t('common.sensor') : t('common.sensors')} · {devices.length} {devices.length === 1 ? t('common.device') : t('common.devices')}
            </span>
          </div>
        </div>

        {onSelectRoom && (
          <button
            type="button"
            className={styles.openDetailBtn}
            onClick={() => onSelectRoom(id)}
            title={displayRoomName}
          >
            <ArrowUpRight size={17} />
          </button>
        )}
      </div>

      {/* 2. Primary Hero Metric (Temperature + Model) */}
      {tempSensor ? (
        <div className={styles.heroMetricBox}>
          <div className={styles.tempLeft}>
            <span className={hasTempNumber ? styles.tempNum : styles.tempNumText}>
              {translateSensorValue(tempSensor.value)}
            </span>
            {hasTempNumber && <span className={styles.tempUnit}>{tempSensor.unit}</span>}
          </div>
          <div className={styles.tempRight}>
            <span className={styles.tempLabel}>{t('dashboard.roomTemp')}</span>
            <span className={styles.heroModelBadge}>
              {tempSensor.model || 'DHT11 · GPIO4'}
            </span>
          </div>
        </div>
      ) : (
        <div className={styles.heroMetricBox}>
          <div className={styles.tempLeft}>
            <span className={styles.tempNumText}>{t('common.noData')}</span>
          </div>
          <div className={styles.tempRight}>
            <span className={styles.tempLabel}>{t('dashboard.zoneStatus')}</span>
            <span className={styles.heroModelBadge}>ESP32-S3</span>
          </div>
        </div>
      )}

      {/* 3. Secondary Sensors List */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.sectionHeading}>
            {tempSensor
              ? t('dashboard.safetyEdgeSensors', { count: secondarySensors.length })
              : t('dashboard.perimeterSensors', { count: secondarySensors.length })}
          </span>
        </div>

        <div className={styles.sensorRows}>
          {secondarySensors.map((sensor) => {
            const sensorAlert = sensor.status === 'ALERT';
            const displaySensorName = t(`sensors.${sensor.id}`) !== `sensors.${sensor.id}` ? t(`sensors.${sensor.id}`) : sensor.name;
            const displaySensorVal = translateSensorValue(sensor.value);
            return (
              <div
                key={sensor.id}
                className={`${styles.sensorItem} ${sensorAlert ? styles.sensorItemAlert : ''}`}
              >
                <div className={styles.sensorItemLeft}>
                  {getSmallSensorIcon(sensor)}
                  <span className={styles.sensorItemName} title={displaySensorName}>
                    {displaySensorName}
                  </span>
                </div>
                <div className={styles.sensorItemRight}>
                  {sensor.model && (
                    <span className={styles.sensorModelPill} title={sensor.model}>
                      {sensor.model.split('·')[0].trim()}
                    </span>
                  )}
                  <span className={sensor.value === 'No Data' ? styles.sensorItemValMuted : styles.sensorItemVal}>
                    {displaySensorVal}{sensor.unit && typeof sensor.value === 'number' ? ` ${sensor.unit}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Smoke Alert Banner when triggered */}
      {isSmokeAlert && (
        <div className={`${styles.smokeRow} ${styles.smokeAlert}`}>
          <Flame size={15} className={styles.iconAlert} />
          <span>{t('dashboard.smokeAlertBanner', { model: smokeSensor?.model || 'MQ-2' })}</span>
        </div>
      )}

      <div className={styles.divider}></div>

      {/* 4. Explicit Devices in Use List */}
      <div className={styles.devicesSection}>
        <span className={styles.sectionHeading}>{t('dashboard.devicesInUse', { count: devices.length })}</span>
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

      {/* 5. Smart Telemetry Footer */}
      <div className={styles.cardFooter}>
        <span className={styles.footerStatus}>
          <span className={isSystemUnavailable || !isHardwareLive ? styles.dotOffline : styles.dotOnline} />
          <span>
            {isSystemUnavailable
              ? t('dashboard.linkOffline')
              : isHardwareLive
                ? t('dashboard.espOnline')
                : t('dashboard.espOffline')}
          </span>
        </span>
        <span className={styles.sourceMiniChip}>{t('common.source')}: {shortSourceLabel}</span>
      </div>
    </div>
  );
}
