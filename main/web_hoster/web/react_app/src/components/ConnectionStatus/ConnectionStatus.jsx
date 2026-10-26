import { Globe, Network, Radio, Wifi } from 'lucide-react';
import styles from './ConnectionStatus.module.css';

export default function ConnectionStatus({ networkState }) {
  const { internet, localLan, mqttBroker } = networkState;

  return (
    <div className={styles.channelsCard}>
      {/* 1. Internet */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Globe size={18} className={internet ? styles.iconGreen : styles.iconWarn} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>Internet</span>
          <span className={`${styles.value} ${internet ? styles.valSuccess : styles.valFailed}`}>
            {internet ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 2. Local network LAN */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Network size={18} className={styles.iconGreen} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>Local network · LAN</span>
          <span className={`${styles.value} ${localLan ? styles.valSuccess : styles.valFailed}`}>
            {localLan ? 'Available' : 'Unavailable'}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 3. MQTT / Local API */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Radio size={18} className={styles.iconGreen} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>MQTT / Local API</span>
          <span className={`${styles.value} ${mqttBroker ? styles.valSuccess : styles.valWarn}`}>
            {mqttBroker ? 'Active' : 'Standby'}
          </span>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* 4. ESP32 Router AP */}
      <div className={styles.channelCol}>
        <div className={styles.iconBox}>
          <Wifi size={18} className={styles.iconGreen} />
        </div>
        <div className={styles.meta}>
          <span className={styles.label}>ESP32 · Router / AP</span>
          <span className={styles.valSuccess}>
            Ready
          </span>
        </div>
      </div>
    </div>
  );
}
