import { Thermometer, Flame, ShieldCheck, Eye, Cpu, Activity, Clock } from 'lucide-react';
import SensorCard from '../SensorCard/SensorCard';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './SensorsView.module.css';

export default function SensorsView({ rooms = [], networkState, isVisitor = false }) {
  const { t, translateSource } = useLanguage();

  const allSensors = rooms.flatMap((room) =>
    (room.sensors || []).map((sensor) => ({
      ...sensor,
      roomName: t(`rooms.${room.id}.name`) !== `rooms.${room.id}.name` ? t(`rooms.${room.id}.name`) : room.name,
      roomId: room.id
    }))
  );

  const smokeSensors = allSensors.filter((s) => s.type === 'smoke');
  const hasSmokeAlert = smokeSensors.some((s) => s.status === 'ALERT');
  const tempSensors = allSensors.filter((s) => s.type === 'temperature');
  const numericTemps = tempSensors.filter((s) => typeof s.value === 'number');
  const rawActiveSource = allSensors.find((s) => s.source)?.source || 'No Data (ESP32-S3)';
  const activeSource = translateSource(rawActiveSource);
  const avgTemp =
    numericTemps.length > 0
      ? `${(numericTemps.reduce((sum, s) => sum + Number(s.value), 0) / numericTemps.length).toFixed(1)} °C`
      : t('common.noData');

  return (
    <div className={styles.container}>
      {/* Top Role & Data-Source Notice */}
      <div className={styles.topBar}>
        <div className={styles.roleBanner}>
          <Eye size={16} className={styles.roleIcon} />
          <span>
            {isVisitor ? t('sensorsView.visitorBanner') : t('sensorsView.adminBanner')}
          </span>
        </div>
        <span className={styles.sourceChip}>{t('common.source')}: {activeSource}</span>
      </div>

      {/* Overview KPI Strip */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIconBox}>
            <Activity size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>{t('sensorsView.monitoredSensors')}</span>
            <span className={styles.kpiValue}>{t('sensorsView.activeNodes', { count: allSensors.length })}</span>
            <span className={styles.kpiSub}>{t('sensorsView.acrossZones', { count: rooms.length })}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconBox}>
            <Thermometer size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>{t('sensorsView.meanIndoorTemp')}</span>
            <span className={styles.kpiValue}>{avgTemp}</span>
            <span className={styles.kpiSub}>{t('sensorsView.dhtArrayBand')}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} ${hasSmokeAlert ? styles.kpiDanger : ''}`}>
          <div className={styles.kpiIconBox}>
            {hasSmokeAlert ? <Flame size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>{t('sensorsView.fireSmokeSafety')}</span>
            <span className={styles.kpiValue}>
              {hasSmokeAlert ? t('sensorsView.smokeAlertStatus') : t('sensorsView.allZonesClear')}
            </span>
            <span className={styles.kpiSub}>{t('sensorsView.mq2DetectorsSub')}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconBox}>
            <Cpu size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>{t('sensorsView.telemetryRouting')}</span>
            <span className={styles.kpiValue}>
              {networkState?.mode === 'LOCAL' ? t('sensorsView.localLanDirect') : t('sensorsView.cloudPlusLan')}
            </span>
            <span className={styles.kpiSub}>
              {t('sensorsView.updatedTime', { time: networkState?.lastUpdated || '--:--' })}
            </span>
          </div>
        </div>
      </div>

      {/* Zone-by-Zone Sensor Cards */}
      <div className={styles.zonesGrid}>
        {rooms.map((room) => {
          const roomSensors = room.sensors || [];
          const displayRoomName = t(`rooms.${room.id}.name`) !== `rooms.${room.id}.name` ? t(`rooms.${room.id}.name`) : room.name;
          const displayRoomDesc = t(`rooms.${room.id}.description`) !== `rooms.${room.id}.description` ? t(`rooms.${room.id}.description`) : room.description;
          const roomSource = translateSource(roomSensors[0]?.source);

          return (
            <section key={room.id} className={styles.zoneCard}>
              <div className={styles.zoneHeader}>
                <div>
                  <h3 className={styles.zoneTitle}>{displayRoomName}</h3>
                  <p className={styles.zoneDesc}>{displayRoomDesc}</p>
                </div>
                <span className={styles.sensorCountBadge}>
                  {roomSensors.length} {roomSensors.length === 1 ? t('common.sensor') : t('common.sensors')}
                </span>
              </div>

              {roomSensors.length > 0 ? (
                <div className={styles.sensorList}>
                  {roomSensors.map((sensor) => (
                    <SensorCard key={sensor.id} sensor={sensor} showSource />
                  ))}
                </div>
              ) : (
                <p className={styles.emptyText}>{t('common.noData')}</p>
              )}

              {/* Read-Only Associated Devices Summary */}
              <div className={styles.devicesReadonly}>
                <span className={styles.devicesHeading}>
                  {t('sensorsView.zoneDevicesReadOnly', { count: room.devices?.length || 0 })}
                </span>
                <div className={styles.devicePills}>
                  {(room.devices || []).map((dev) => {
                    const isOn = dev.state === true || dev.state === 'UNLOCKED';
                    const displayDevName = t(`devices.${dev.id}`) !== `devices.${dev.id}` ? t(`devices.${dev.id}`) : dev.name;
                    const stateText =
                      dev.type === 'lock'
                        ? (dev.state === 'UNLOCKED' ? t('common.unlocked') : t('common.locked'))
                        : dev.type === 'ups'
                          ? `${dev.value} ${dev.unit || ''}`.trim()
                          : isOn
                            ? t('common.on')
                            : t('common.off');
                    return (
                      <span
                        key={dev.id}
                        className={`${styles.devicePill} ${isOn ? styles.devicePillOn : ''}`}
                      >
                        <strong>{displayDevName}</strong>
                        <span className={styles.deviceState}>{stateText}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className={styles.zoneFooter}>
                <Clock size={13} />
                <span>{t('sensorsView.telemetryInterval')} · {t('common.source')}: {roomSource}</span>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
