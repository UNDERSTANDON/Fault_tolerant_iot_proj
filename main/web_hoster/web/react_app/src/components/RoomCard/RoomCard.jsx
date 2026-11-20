import { Sofa, Utensils, Bed, Compass, ArrowUpRight, ShieldCheck, Flame } from 'lucide-react';
import DeviceControl from '../DeviceControl/DeviceControl';
import styles from './RoomCard.module.css';

export default function RoomCard({ room, onToggleDevice, isSystemUnavailable, onSelectRoom }) {
  const { id, name, devices, sensors } = room;

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

  // Find temperature and smoke sensors
  const tempSensor = sensors.find((s) => s.type === 'temperature');
  const smokeSensor = sensors.find((s) => s.type === 'smoke');
  const isSmokeAlert = smokeSensor?.status === 'ALERT';

  return (
    <div className={styles.cardContainer}>
      {/* 1. Header with Icon, Title, and ↗ Arrow */}
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.iconSquare}>
            {getRoomIcon()}
          </div>
          <div className={styles.headerText}>
            <h3 className={styles.roomName}>{name}</h3>
            <span className={styles.roomSub}>Demo device state</span>
          </div>
        </div>

        {onSelectRoom && (
          <button
            type="button"
            className={styles.openDetailBtn}
            onClick={() => onSelectRoom(id)}
            title={`View ${name} details`}
          >
            <ArrowUpRight size={18} />
          </button>
        )}
      </div>

      {/* 2. Temperature Big Metric */}
      {tempSensor ? (
        <div className={styles.tempRow}>
          <div className={styles.tempLeft}>
            <span className={styles.tempNum}>{tempSensor.value}</span>
            <span className={styles.tempUnit}>{tempSensor.unit}</span>
          </div>
          <div className={styles.tempRight}>
            <span className={styles.tempLabel}>Simulated room temperature</span>
            <span className={styles.tempTime}>Not a live reading</span>
          </div>
        </div>
      ) : (
        <div className={styles.tempRow}>
          <div className={styles.tempLeft}>
            <span className={styles.tempNum}>Zone</span>
          </div>
          <div className={styles.tempRight}>
            <span className={styles.tempLabel}>Entrance status</span>
            <span className={styles.tempTime}>Simulated</span>
          </div>
        </div>
      )}

      {/* 3. Smoke or Perimeter Indicator (Bug 4 Fixed) */}
      <div className={`${styles.smokeRow} ${isSmokeAlert ? styles.smokeAlert : ''}`}>
        {smokeSensor ? (
          isSmokeAlert ? (
            <>
              <Flame size={15} className={styles.iconAlert} />
              <span>Simulated smoke alert · not a sensor reading</span>
            </>
          ) : (
            <>
              <ShieldCheck size={15} className={styles.iconNormal} />
              <span>Simulated smoke status · not a sensor reading</span>
            </>
          )
        ) : (
          <>
            <ShieldCheck size={15} className={styles.iconNormal} />
            <span>Perimeter status · NFC & UPS not connected</span>
          </>
        )}
      </div>

      <div className={styles.divider}></div>

      {/* 4. Device Controls List */}
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

      {/* 5. Footer Note */}
      <div className={styles.cardFooter}>
        <span>Demo only: simulated devices and sensor values; not connected to hardware.</span>
      </div>
    </div>
  );
}
