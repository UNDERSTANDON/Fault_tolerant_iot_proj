import { ArrowLeft, ShieldAlert, CheckCircle2, WifiOff, HardDrive, Cpu, Power } from 'lucide-react';
import styles from './LocalFallbackView.module.css';

export default function LocalFallbackView({ networkState, rooms = [], onToggleDevice, onBackToDashboard }) {
  const isLocalActive = networkState?.mode === 'LOCAL';

  const allDevices = rooms.flatMap((r) => (r.devices || []).map((d) => ({ ...d, roomName: r.name })));

  return (
    <div className={styles.container}>
      {/* Header Navigation */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
          title="Return to Home Overview"
        >
          <ArrowLeft size={18} />
          <span>Back to Overview</span>
        </button>
        <div className={styles.screenTag}>Screen S4: Local Fallback Monitor · Source: Simulator</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Autonomous Local Fallback Architecture</h2>
        <p className={styles.subtitle}>
          Zero-cloud domestic resilience under Internet partitioning: local LAN actuation and edge state caching.
        </p>
      </div>

      {/* Hero Fallback Status Card */}
      <div className={`${styles.statusHero} ${isLocalActive ? styles.heroActive : styles.heroStandby}`}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIconBox}>
            {isLocalActive ? <WifiOff size={28} /> : <ShieldAlert size={28} />}
          </div>
          <div>
            <div className={styles.heroTitleRow}>
              <h3 className={styles.heroTitle}>
                {isLocalActive ? 'LOCAL FALLBACK MODE CURRENTLY ENGAGED' : 'LOCAL FALLBACK SUBSYSTEM STANDBY'}
              </h3>
              <span className={styles.heroBadge}>{isLocalActive ? 'ENGAGED' : 'STANDBY'}</span>
            </div>
            <p className={styles.heroDesc}>
              {isLocalActive
                ? 'External Internet path is offline. SafeHaven has switched routing to the domestic ESP32-S3 Gateway over Local LAN.'
                : 'Primary Cloud + LAN routing is active. Local fallback watchdog monitors the domestic gateway for sub-500ms automatic failover.'}
            </p>
          </div>
        </div>
      </div>

      {/* Architectural Pillars Grid */}
      <div className={styles.pillarsGrid}>
        <div className={styles.pillarCard}>
          <HardDrive size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>1. Local State Cache</h4>
          <p className={styles.pillarText}>
            Device states and zone configurations remain cached in local memory and edge non-volatile storage during WAN outages.
          </p>
        </div>

        <div className={styles.pillarCard}>
          <Cpu size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>2. Direct LAN &amp; Edge Gateway</h4>
          <p className={styles.pillarText}>
            Local WebSocket/HTTP communication between SafeHaven UI and the ESP32-S3 gateway operates without external DNS or cloud dependencies.
          </p>
        </div>

        <div className={styles.pillarCard}>
          <CheckCircle2 size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>3. Non-Blocking Controls</h4>
          <p className={styles.pillarText}>
            Domestic lighting, ventilation, and safety indicators remain responsive whenever the Local LAN link is reachable.
          </p>
        </div>
      </div>

      {/* Local Reachability Matrix & Direct Controls */}
      <div className={styles.matrixCard}>
        <div className={styles.matrixHeader}>
          <h3 className={styles.matrixTitle}>Domestic LAN Device Reachability Matrix</h3>
          <span className={styles.matrixCount}>{allDevices.length} Local Endpoints · Source: Simulator</span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Device Name</th>
                <th>Monitored Zone</th>
                <th>Hardware Channel</th>
                <th>Current State</th>
                <th>Local Route</th>
                <th>Direct Action</th>
              </tr>
            </thead>
            <tbody>
              {allDevices.map((device) => {
                const isOn = device.state === true || device.state === 'UNLOCKED';
                const isSwitchable = device.type === 'light' || device.type === 'fan' || device.type === 'lock';

                return (
                  <tr key={device.id}>
                    <td className={styles.deviceNameCell}>
                      <strong>{device.name}</strong>
                    </td>
                    <td>{device.roomName}</td>
                    <td>
                      <span className={styles.typeBadge}>{device.model || device.type.toUpperCase()}</span>
                    </td>
                    <td>
                      <span className={`${styles.stateBadge} ${isOn ? styles.stateOn : styles.stateOff}`}>
                        {device.type === 'lock' ? (isOn ? 'Unlocked' : 'Locked') : (isOn ? 'ON' : 'OFF')}
                      </span>
                    </td>
                    <td>
                      <span className={styles.routeTag}>
                        <CheckCircle2 size={12} color="#10b981" />
                        <code>ws://192.168.1.1/{device.id}</code>
                      </span>
                    </td>
                    <td>
                      {isSwitchable ? (
                        <button
                          type="button"
                          className={`${styles.quickToggleBtn} ${isOn ? styles.btnOn : styles.btnOff}`}
                          onClick={() => onToggleDevice && onToggleDevice(device.id, !isOn)}
                          title={`Switch ${device.name} ${isOn ? 'OFF' : 'ON'}`}
                        >
                          <Power size={13} />
                          <span>{isOn ? 'Turn OFF' : 'Turn ON'}</span>
                        </button>
                      ) : (
                        <span className={styles.naText}>Telemetry node</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
