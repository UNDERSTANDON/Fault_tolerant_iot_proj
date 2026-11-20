import { Thermometer, Flame, ShieldCheck, Eye, Cpu, Activity, Clock } from 'lucide-react';
import SensorCard from '../SensorCard/SensorCard';
import styles from './SensorsView.module.css';

export default function SensorsView({ rooms = [], networkState, isVisitor = false }) {
  const allSensors = rooms.flatMap((room) =>
    (room.sensors || []).map((sensor) => ({
      ...sensor,
      roomName: room.name,
      roomId: room.id
    }))
  );

  const smokeSensors = allSensors.filter((s) => s.type === 'smoke');
  const hasSmokeAlert = smokeSensors.some((s) => s.status === 'ALERT');
  const tempSensors = allSensors.filter((s) => s.type === 'temperature');
  const avgTemp =
    tempSensors.length > 0
      ? (tempSensors.reduce((sum, s) => sum + Number(s.value || 0), 0) / tempSensors.length).toFixed(1)
      : '—';

  return (
    <div className={styles.container}>
      {/* Top Role & Data-Source Notice */}
      <div className={styles.topBar}>
        <div className={styles.roleBanner}>
          <Eye size={16} className={styles.roleIcon} />
          <span>
            {isVisitor
              ? 'Visitor Read-Only Telemetry · Live environmental sensor monitoring across all domestic zones (device actuation restricted).'
              : 'Environmental Sensor Matrix · Real-time zone readings, hardware sensor models, and threshold status.'}
          </span>
        </div>
        <span className={styles.sourceChip}>Source: Simulator</span>
      </div>

      {/* Overview KPI Strip */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIconBox}>
            <Activity size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>Monitored Sensors</span>
            <span className={styles.kpiValue}>{allSensors.length} Active Nodes</span>
            <span className={styles.kpiSub}>Across {rooms.length} domestic zones</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconBox}>
            <Thermometer size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>Mean Indoor Temp</span>
            <span className={styles.kpiValue}>{avgTemp} °C</span>
            <span className={styles.kpiSub}>DHT22 thermal array (20°C – 35°C band)</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} ${hasSmokeAlert ? styles.kpiDanger : ''}`}>
          <div className={styles.kpiIconBox}>
            {hasSmokeAlert ? <Flame size={20} /> : <ShieldCheck size={20} />}
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>Fire &amp; Smoke Safety</span>
            <span className={styles.kpiValue}>
              {hasSmokeAlert ? 'SMOKE ALERT' : 'All Zones Clear'}
            </span>
            <span className={styles.kpiSub}>MQ-2 particulate &amp; gas detectors</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIconBox}>
            <Cpu size={20} />
          </div>
          <div className={styles.kpiMeta}>
            <span className={styles.kpiLabel}>Telemetry Routing</span>
            <span className={styles.kpiValue}>
              {networkState?.mode === 'LOCAL' ? 'Local LAN Direct' : 'Cloud + Local LAN'}
            </span>
            <span className={styles.kpiSub}>
              Updated {networkState?.lastUpdated || 'Live'}
            </span>
          </div>
        </div>
      </div>

      {/* Zone-by-Zone Sensor Cards */}
      <div className={styles.zonesGrid}>
        {rooms.map((room) => {
          const roomSensors = room.sensors || [];
          return (
            <section key={room.id} className={styles.zoneCard}>
              <div className={styles.zoneHeader}>
                <div>
                  <h3 className={styles.zoneTitle}>{room.name}</h3>
                  <p className={styles.zoneDesc}>{room.description}</p>
                </div>
                <span className={styles.sensorCountBadge}>
                  {roomSensors.length} {roomSensors.length === 1 ? 'Sensor' : 'Sensors'}
                </span>
              </div>

              {roomSensors.length > 0 ? (
                <div className={styles.sensorList}>
                  {roomSensors.map((sensor) => (
                    <SensorCard key={sensor.id} sensor={sensor} showSource />
                  ))}
                </div>
              ) : (
                <p className={styles.emptyText}>No environmental sensors installed in this zone.</p>
              )}

              {/* Read-Only Associated Devices Summary (Non-interactive) */}
              <div className={styles.devicesReadonly}>
                <span className={styles.devicesHeading}>
                  Zone Devices in Use ({room.devices?.length || 0}) · Read-Only State
                </span>
                <div className={styles.devicePills}>
                  {(room.devices || []).map((dev) => {
                    const isOn = dev.state === true || dev.state === 'UNLOCKED';
                    const stateText =
                      dev.type === 'lock'
                        ? dev.state
                        : dev.type === 'ups'
                          ? `${dev.value} ${dev.unit || ''}`.trim()
                          : isOn
                            ? 'ON'
                            : 'OFF';
                    return (
                      <span
                        key={dev.id}
                        className={`${styles.devicePill} ${isOn ? styles.devicePillOn : ''}`}
                      >
                        <strong>{dev.name}</strong>
                        <span className={styles.deviceState}>{stateText}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className={styles.zoneFooter}>
                <Clock size={13} />
                <span>Telemetry interval: 2000ms · Source: {roomSensors[0]?.source || 'Simulator'}</span>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
