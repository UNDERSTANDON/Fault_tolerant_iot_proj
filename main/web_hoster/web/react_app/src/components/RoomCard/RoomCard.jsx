import { Sofa, Utensils, Bed, Compass, ArrowUpRight, ShieldCheck, Flame, Thermometer, Droplets, Wifi } from 'lucide-react';
import DeviceControl from '../DeviceControl/DeviceControl';
import styles from './RoomCard.module.css';

export default function RoomCard({ room, onToggleDevice, isSystemUnavailable, onSelectRoom }) {
  const { id, name, devices = [], sensors = [] } = room;

  const getRoomIcon = () => {
    switch (id) {
      case 'living_room':
        return <Sofa size={20} className={styles.iconAccent} />;
      case 'kitchen':
        return <Utensils size={20} className={styles.iconAccent} />;
      case 'bedroom':
        return <Bed size={20} className={styles.iconAccent} />;
      case 'hallway':
      default:
        return <Compass size={20} className={styles.iconAccent} />;
    }
  };

  const getSmallSensorIcon = (sensor) => {
    if (sensor.type === 'temperature') return <Thermometer size={13} className={styles.iconTemp} />;
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

  return (
    <div className={styles.cardContainer}>
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
            <ArrowUpRight size={18} />
          </button>
        )}
      </div>

      {/* 2. Primary Metric Row */}
      {tempSensor ? (
        <div className={styles.tempRow}>
          <div className={styles.tempLeft}>
            <span className={styles.tempNum}>{tempSensor.value}</span>
            <span className={styles.tempUnit}>{tempSensor.unit}</span>
          </div>
          <div className={styles.tempRight}>
            <span className={styles.tempLabel}>{tempSensor.name}</span>
            <span className={styles.tempTime}>Sensor: {tempSensor.model || 'DHT22'}</span>
          </div>
        </div>
      ) : (
        <div className={styles.tempRow}>
          <div className={styles.tempLeft}>
            <span className={styles.tempNum}>Zone</span>
          </div>
          <div className={styles.tempRight}>
            <span className={styles.tempLabel}>Entrance Perimeter</span>
            <span className={styles.tempTime}>PN532 &amp; MQ-2 Active</span>
          </div>
        </div>
      )}

      {/* 3. Explicit Sensors List (Sensor Name + Hardware Model + Value) */}
      <div className={styles.sectionBlock}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.sectionHeading}>SENSORS ({sensors.length})</span>
          <span className={styles.sourceMiniChip}>Source: Simulator</span>
        </div>

        <div className={styles.sensorRows}>
          {sensors.map((sensor) => {
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
                  {sensor.model && (
                    <span className={styles.sensorModelPill}>{sensor.model}</span>
                  )}
                </div>
                <span className={styles.sensorItemVal}>
                  {sensor.value}{sensor.unit ? ` ${sensor.unit}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Smoke Alert Banner when triggered */}
      {isSmokeAlert && (
        <div className={`${styles.smokeRow} ${styles.smokeAlert}`}>
          <Flame size={15} className={styles.iconAlert} />
          <span>Smoke hazard alert ({smokeSensor?.model || 'MQ-2'}) · Immediate attention!</span>
        </div>
      )}

      <div className={styles.divider}></div>

      {/* 4. Explicit Devices in Use List */}
      <div className={styles.sectionBlock}>
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

      {/* 5. Footer Note */}
      <div className={styles.cardFooter}>
        <span>Local-first zone control · Telemetry &amp; state active</span>
      </div>
    </div>
  );
}
