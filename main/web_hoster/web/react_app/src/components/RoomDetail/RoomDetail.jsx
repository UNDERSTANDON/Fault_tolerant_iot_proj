import { useEffect } from 'react';
import { X, Sofa, Utensils, Bed, Compass, ShieldCheck, Thermometer, Droplets, Clock, Activity } from 'lucide-react';
import DeviceControl from '../DeviceControl/DeviceControl';
import SensorCard from '../SensorCard/SensorCard';
import styles from './RoomDetail.module.css';

export default function RoomDetail({ room, onClose, onToggleDevice, isSystemUnavailable, networkMode }) {
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

  const { id, name, description, devices, sensors } = room;

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

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.iconBox}>
              {getRoomIcon()}
            </div>
            <div>
              <div className={styles.titleRow}>
                <h2 className={styles.modalTitle}>{name}</h2>
                <span className={styles.screenTag}>Screen S2: Room Detail</span>
              </div>
              <p className={styles.modalDesc}>{description}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title="Close room details"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Strip */}
        <div className={styles.statusStrip}>
          <div className={styles.stripItem}>
            <Activity size={16} className={styles.stripIcon} />
            <span>Active Devices: <strong>{activeDeviceCount}/{devices.length}</strong></span>
          </div>
          <div className={styles.stripItem}>
            <ShieldCheck size={16} className={styles.stripIcon} />
            <span>Active Routing: <strong>{networkMode === 'LOCAL' ? 'Local Area Network (LAN)' : 'Cloud & LAN'}</strong></span>
          </div>
        </div>

        {/* Body Grid */}
        <div className={styles.modalBody}>
          {/* Column 1: Device Controls */}
          <div className={styles.block}>
            <h3 className={styles.blockTitle}>Device Controls ({devices.length})</h3>
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
              <h3 className={styles.blockTitle}>Sensors & Environment ({sensors.length})</h3>
              <div className={styles.sensorGrid}>
                {sensors.map((sensor) => (
                  <SensorCard key={sensor.id} sensor={sensor} />
                ))}
              </div>

              {/* Advanced telemetry gauges */}
              <div className={styles.advancedMetrics}>
                <div className={styles.metricCard}>
                  <div className={styles.metricHead}>
                    <Thermometer size={16} color="#f97316" />
                    <span>Ambient Room Temperature</span>
                  </div>
                  <div className={styles.gaugeContainer}>
                    <div className={styles.gaugeBar}>
                      <div className={styles.gaugeFill} style={{ width: '70%' }}></div>
                    </div>
                    <span className={styles.gaugeLabel}>Comfort Zone (20°C - 35°C)</span>
                  </div>
                </div>

                {id === 'kitchen' && (
                  <div className={styles.metricCard}>
                    <div className={styles.metricHead}>
                      <Droplets size={16} color="#38bdf8" />
                      <span>Kitchen Relative Humidity</span>
                    </div>
                    <div className={styles.gaugeContainer}>
                      <div className={styles.gaugeBar}>
                        <div className={`${styles.gaugeFill} ${styles.fillHumidity}`} style={{ width: '65%' }}></div>
                      </div>
                      <span className={styles.gaugeLabel}>Optimal Range (50% - 70%)</span>
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
            <span>Live telemetry synchronization active</span>
          </div>
          <button type="button" className={styles.backBtn} onClick={onClose}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
