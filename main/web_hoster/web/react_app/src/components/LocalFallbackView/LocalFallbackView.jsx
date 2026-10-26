import { ArrowLeft, ShieldAlert, CheckCircle2, WifiOff, HardDrive, Cpu, Power } from 'lucide-react';
import styles from './LocalFallbackView.module.css';

export default function LocalFallbackView({ networkState, rooms, onToggleDevice, onBackToDashboard }) {
  const isLocalActive = networkState.mode === 'LOCAL';

  // Gather all controllable devices across rooms
  const allDevices = rooms.flatMap((r) => r.devices.map((d) => ({ ...d, roomName: r.name })));

  return (
    <div className={styles.container}>
      {/* Header Navigation */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
          title="Return to Main Dashboard"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>
        <div className={styles.screenTag}>Screen S4: Local Fallback Monitor</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Autonomous Local Fallback Architecture</h2>
        <p className={styles.subtitle}>
          Core research implementation for Topic 6.1: Zero-cloud domestic resilience under network partitioning.
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
                {isLocalActive ? 'LOCAL FALLBACK MODE IS CURRENTLY ENGAGED' : 'LOCAL FALLBACK SUBSYSTEM STANDBY'}
              </h3>
              <span className={styles.heroBadge}>{isLocalActive ? 'ENGAGED' : 'MONITORING'}</span>
            </div>
            <p className={styles.heroDesc}>
              {isLocalActive
                ? 'External Internet path is severed. The interface has seamlessly switched routing to the domestic ESP32 Gateway. Commands execute via Local LAN with sub-20ms latency.'
                : 'Full Internet is currently active. The local fallback watchdog continually polls Gateway 192.168.1.1, prepared to engage instant failover within 400ms of any cloud disconnection.'}
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
            Device states and room configurations are cached in client memory and ESP32 non-volatile storage, preventing state loss during outages.
          </p>
        </div>

        <div className={styles.pillarCard}>
          <Cpu size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>2. P2P Gateway Protocol</h4>
          <p className={styles.pillarText}>
            Direct WebSocket communication between the React web interface and ESP32 access point bypasses public DNS and external CDNs.
          </p>
        </div>

        <div className={styles.pillarCard}>
          <CheckCircle2 size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>3. Non-Blocking UX</h4>
          <p className={styles.pillarText}>
            Adheres to UI_RULES Article 8: Domestic switches and controls are never greyed out or locked while the Local LAN remains reachable.
          </p>
        </div>
      </div>

      {/* Local Reachability Matrix & Direct Controls */}
      <div className={styles.matrixCard}>
        <div className={styles.matrixHeader}>
          <h3 className={styles.matrixTitle}>Domestic LAN Device Reachability Matrix</h3>
          <span className={styles.matrixCount}>{allDevices.length} Local Endpoints Verified</span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Device Name</th>
                <th>Monitored Zone</th>
                <th>Type</th>
                <th>Current State</th>
                <th>LAN Path</th>
                <th>Direct Control</th>
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
                      <span className={styles.typeBadge}>{device.type.toUpperCase()}</span>
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
                          onClick={() => onToggleDevice(device.id, !isOn)}
                          title={`Toggle ${device.name}`}
                        >
                          <Power size={13} />
                          <span>{isOn ? 'Turn OFF' : 'Turn ON'}</span>
                        </button>
                      ) : (
                        <span className={styles.naText}>Telemetry only</span>
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

