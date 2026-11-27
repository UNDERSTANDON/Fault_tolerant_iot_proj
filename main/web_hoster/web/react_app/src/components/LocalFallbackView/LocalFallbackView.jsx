import { ArrowLeft, ShieldAlert, CheckCircle2, WifiOff, HardDrive, Cpu, Power } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './LocalFallbackView.module.css';

export default function LocalFallbackView({ networkState, hardwareStatus, rooms = [], onToggleDevice, onBackToDashboard }) {
  const { t, translateSource } = useLanguage();
  const isLocalActive = networkState?.mode === 'LOCAL';
  const sourceLabel = translateSource(hardwareStatus?.dataSource);

  const allDevices = rooms.flatMap((r) =>
    (r.devices || []).map((d) => ({
      ...d,
      displayName: t(`devices.${d.id}`) !== `devices.${d.id}` ? t(`devices.${d.id}`) : d.name,
      roomName: t(`rooms.${r.id}.name`) !== `rooms.${r.id}.name` ? t(`rooms.${r.id}.name`) : r.name
    }))
  );

  return (
    <div className={styles.container}>
      {/* Header Navigation */}
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBackToDashboard}
        >
          <ArrowLeft size={18} />
          <span>{t('common.backToOverview')}</span>
        </button>
        <div className={styles.screenTag}>{t('localFallback.screenTag')} · {t('common.source')}: {sourceLabel}</div>
      </div>

      <div className={styles.titleSection}>
        <h2 className={styles.title}>{t('localFallback.title')}</h2>
        <p className={styles.subtitle}>{t('localFallback.subtitle')}</p>
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
                {isLocalActive ? t('localFallback.heroEngaged') : t('localFallback.heroStandby')}
              </h3>
              <span className={styles.heroBadge}>
                {isLocalActive ? t('localFallback.engagedBadge') : t('localFallback.standbyBadge')}
              </span>
            </div>
            <p className={styles.heroDesc}>
              {isLocalActive ? t('localFallback.heroDescEngaged') : t('localFallback.heroDescStandby')}
            </p>
          </div>
        </div>
      </div>

      {/* Architectural Pillars Grid */}
      <div className={styles.pillarsGrid}>
        <div className={styles.pillarCard}>
          <HardDrive size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>{t('localFallback.pillar1Title')}</h4>
          <p className={styles.pillarText}>{t('localFallback.pillar1Text')}</p>
        </div>

        <div className={styles.pillarCard}>
          <Cpu size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>{t('localFallback.pillar2Title')}</h4>
          <p className={styles.pillarText}>{t('localFallback.pillar2Text')}</p>
        </div>

        <div className={styles.pillarCard}>
          <CheckCircle2 size={22} className={styles.pillarIcon} />
          <h4 className={styles.pillarTitle}>{t('localFallback.pillar3Title')}</h4>
          <p className={styles.pillarText}>{t('localFallback.pillar3Text')}</p>
        </div>
      </div>

      {/* Local Reachability Matrix & Direct Controls */}
      <div className={styles.matrixCard}>
        <div className={styles.matrixHeader}>
          <h3 className={styles.matrixTitle}>{t('localFallback.matrixTitle')}</h3>
          <span className={styles.matrixCount}>
            {t('localFallback.localEndpoints', { count: allDevices.length })} · {t('common.source')}: {sourceLabel}
          </span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('localFallback.colDeviceName')}</th>
                <th>{t('localFallback.colZone')}</th>
                <th>{t('localFallback.colChannel')}</th>
                <th>{t('localFallback.colState')}</th>
                <th>{t('localFallback.colRoute')}</th>
                <th>{t('localFallback.colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {allDevices.map((device) => {
                const isOn = device.state === true || device.state === 'UNLOCKED';
                const isSwitchable = device.type === 'light' || device.type === 'fan' || device.type === 'lock';

                return (
                  <tr key={device.id}>
                    <td className={styles.deviceNameCell}>
                      <strong>{device.displayName}</strong>
                    </td>
                    <td>{device.roomName}</td>
                    <td>
                      <span className={styles.typeBadge}>{device.model || device.type.toUpperCase()}</span>
                    </td>
                    <td>
                      <span className={`${styles.stateBadge} ${isOn ? styles.stateOn : styles.stateOff}`}>
                        {device.type === 'lock'
                          ? (isOn ? t('common.unlocked') : t('common.locked'))
                          : (isOn ? t('common.on') : t('common.off'))}
                      </span>
                    </td>
                    <td>
                      <span className={styles.routeTag}>
                        <CheckCircle2 size={12} color="#10b981" />
                        <code>http://192.168.4.1/api/hardware/command</code>
                      </span>
                    </td>
                    <td>
                      {isSwitchable ? (
                        <button
                          type="button"
                          className={`${styles.quickToggleBtn} ${isOn ? styles.btnOn : styles.btnOff}`}
                          onClick={() => onToggleDevice && onToggleDevice(device.id, !isOn)}
                        >
                          <Power size={13} />
                          <span>{isOn ? t('localFallback.turnOff') : t('localFallback.turnOn')}</span>
                        </button>
                      ) : (
                        <span className={styles.naText}>{t('localFallback.telemetryNode')}</span>
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
