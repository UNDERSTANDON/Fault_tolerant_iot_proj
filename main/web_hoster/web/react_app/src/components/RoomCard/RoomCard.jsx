import { Sofa, Utensils, Bed, Compass, ArrowUpRight, ShieldCheck, Flame, Droplets, Wifi } from 'lucide-react';
import DeviceControl from '../DeviceControl/DeviceControl';
import styles from './RoomCard.module.css';

export default function RoomCard({ room, onToggleDevice, isSystemUnavailable, onSelectRoom }) {
  const { id, name, devices = [], sensors = [] } = room;

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
  const upsDevice = devices.find((d) => d.type === 'ups');

  // Filter out temperature sensor from secondary list so it isn't duplicated right below the Hero readout
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
            <h3 className={styles.roomName}>{name}</h3>
            <span className={styles.roomSub}>
              {sensors.length} {sensors.length === 1 ? 'sensor' : 'sensors'} · {devices.length} {devices.length === 1 ? 'device' : 'devices'}
            </span>
          </div>
        </div>

        {onSelectRoom && (
          <button
            type="button"
            className={styles.openDetailBtn}
            onClick={() => onSelectRoom(id)}
            title={`Open ${name} controls & sensors`}
          >
            <ArrowUpRight size={17} />
          </button>
        )}
      </div>

      {/* 2. Primary Hero Metric (Temperature + Model OR UPS Battery Reserve for Hallway) */}
      {tempSensor ? (
        <div className={styles.heroMetricBox}>
          <div className={styles.tempLeft}>
            <span className={styles.tempNum}>{tempSensor.value}</span>
            <span className={styles.tempUnit}>{tempSensor.unit}</span>
          </div>
          <div className={styles.tempRight}>
            <span className={styles.tempLabel}>Room Temp</span>
            <span className={styles.heroModelBadge}>{tempSensor.model || 'DHT22'} · Comfort</span>
          </div>
        </div>
      ) : (
        <div className={styles.heroMetricBox}>
          <div className={styles.tempLeft}>
            <span className={styles.tempNum}>{upsDevice ? '100' : 'Armed'}</span>
            {upsDevice && <span className={styles.tempUnit}>%</span>}
          </div>
          <div className={styles.tempRight}>
            <span className={styles.tempLabel}>UPS Reserve</span>
            <span className={styles.heroModelBadge}>LiFePO4 · 24h</span>
          </div>
        </div>
      )}

      {/* 3. Secondary Sensors List (Aligned height across all 4 cards, zero duplication) */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.sectionHeading}>
            {tempSensor ? `SAFETY & EDGE SENSORS (${secondarySensors.length})` : `PERIMETER SENSORS (${secondarySensors.length})`}
          </span>
        </div>

        <div className={styles.sensorRows}>
          {secondarySensors.map((sensor) => {
            const sensorAlert = sensor.status === 'ALERT';
            return (
              <div
                key={sensor.id}
                className={`${styles.sensorItem} ${sensorAlert ? styles.sensorItemAlert : ''}`}
              >
                <div className={styles.sensorItemLeft}>
                  {getSmallSensorIcon(sensor)}
                  <span className={styles.sensorItemName} title={sensor.name}>
                    {sensor.name}
                  </span>
                </div>
                <div className={styles.sensorItemRight}>
                  {sensor.model && (
                    <span className={styles.sensorModelPill}>{sensor.model}</span>
                  )}
                  <span className={styles.sensorItemVal}>
                    {sensor.value}{sensor.unit ? ` ${sensor.unit}` : ''}
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
          <span>Smoke hazard alert ({smokeSensor?.model || 'MQ-2'}) · Evacuate!</span>
        </div>
      )}

      <div className={styles.divider}></div>

      {/* 4. Explicit Devices in Use List */}
      <div className={styles.devicesSection}>
        <span className={styles.sectionHeading}>DEVICES IN USE ({devices.length})</span>
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
          <span className={isSystemUnavailable ? styles.dotOffline : styles.dotOnline} />
          <span>{isSystemUnavailable ? 'Link Offline' : 'LAN Route · ACK ~12ms'}</span>
        </span>
        <span className={styles.sourceMiniChip}>Source: Simulator</span>
      </div>
    </div>
  );
}
