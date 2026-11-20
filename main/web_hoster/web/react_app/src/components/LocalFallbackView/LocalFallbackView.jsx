import { ArrowLeft, ShieldAlert, WifiOff, HardDrive, Cpu, Power } from 'lucide-react';
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
        <div className={styles.screenTag}>Simulated local fallback</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>Local fallback demo scenario</h2>
        <p className={styles.subtitle}>
          This screen changes simulated UI state only. It does not test network failover or connect to devices.
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
                {isLocalActive ? 'SIMULATED LOCAL MODE' : 'SIMULATED BASELINE'}
              </h3>
              <span className={styles.heroBadge}>DEMO ONLY</span>
            </div>
            <p className={styles.heroDesc}>
              {isLocalActive
                ? 'The dashboard is showing its local-mode scenario. No internet path was severed, no ESP32 route was tested, and no device commands are available.'
                : 'The displayed baseline is simulated. No watchdog, gateway polling, or automatic failover is implemented here.'}
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
            Persistent device-state caching is planned but not implemented. Values on this screen are mock data.
          </p>
        </div>

        <div className={styles.pillarCard}>
          <Cpu size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>2. P2P Gateway Protocol</h4>
          <p className={styles.pillarText}>
            A React-to-ESP32 device API is not connected. The only live integration currently shown is the MQTT connectivity-test path.
          </p>
        </div>

        <div className={styles.pillarCard}>
          <CheckCircle2 size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>3. Non-Blocking UX</h4>
          <p className={styles.pillarText}>
            Demo controls only change mock state. Hardware command acknowledgements and safety behavior are not implemented.
          </p>
        </div>
      </div>

      {/* Local Reachability Matrix & Direct Controls */}
      <div className={styles.matrixCard}>
        <div className={styles.matrixHeader}>
          <h3 className={styles.matrixTitle}>Simulated device-state list</h3>
          <span className={styles.matrixCount}>No device endpoints verified</span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Device Name</th>
                <th>Monitored Zone</th>
                <th>Type</th>
                <th>Current State</th>
                <th>Hardware connection</th>
                <th>Demo action</th>
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
                        SIM {device.type === 'lock' ? (isOn ? 'Unlocked' : 'Locked') : (isOn ? 'ON' : 'OFF')}
                      </span>
                    </td>
                    <td>
                      <span className={styles.naText}>Not connected</span>
                    </td>
                    <td>
                      {isSwitchable ? (
                        <button
                          type="button"
                          className={`${styles.quickToggleBtn} ${isOn ? styles.btnOn : styles.btnOff}`}
                          onClick={() => onToggleDevice(device.id, !isOn)}
                          title={`Demo only: simulate ${device.name}; no hardware command is sent`}
                        >
                          <Power size={13} />
                          <span>Simulate {isOn ? 'OFF' : 'ON'}</span>
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

