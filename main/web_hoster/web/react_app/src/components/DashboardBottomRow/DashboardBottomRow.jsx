import { Lightbulb, Fan, Lock, Network, ArrowRight, ArrowUpRight, ShieldCheck } from 'lucide-react';
import styles from './DashboardBottomRow.module.css';

export default function DashboardBottomRow({ networkMode, onNavigateToConnections, recentActivity = [] }) {
  const isLocal = networkMode === 'LOCAL';

  const getActivityIcon = (type) => {
    switch (type) {
      case 'fan':
        return <Fan size={16} />;
      case 'lock':
        return <Lock size={16} />;
      case 'network':
        return <Network size={16} />;
      case 'light':
      default:
        return <Lightbulb size={16} />;
    }
  };

  return (
    <div className={styles.bottomGrid}>
      {/* 1. Dynamic Recent Activity Card (Bug 5 Fixed) */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Recent activity</h3>
          <span className={styles.badgeConfirmed}>Simulated actions · live MQTT tests</span>
        </div>

        <div className={styles.activityList}>
          {recentActivity.slice(0, 4).map((item) => (
            <div key={item.id} className={styles.activityItem}>
              <div className={styles.itemIconCircle}>
                {getActivityIcon(item.type)}
              </div>
              <div className={styles.itemMeta}>
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={styles.itemSub}>{item.sub}</span>
              </div>
              <span className={styles.itemTime}>{item.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Local Connection First Card */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.titleWithIcon}>
            <ShieldCheck size={18} color="#285640" />
            <h3 className={styles.cardTitle}>
              {isLocal ? 'Simulated local mode' : 'Local-first demo preview'}
            </h3>
          </div>
        </div>

        <div className={styles.flowDiagram}>
          <span className={styles.flowPill}>Interface</span>
          <ArrowRight size={14} color="#6b756d" />
          <span className={styles.flowPill}>LAN</span>
          <ArrowRight size={14} color="#6b756d" />
          <span className={styles.flowPill}>ESP32</span>
        </div>

        <p className={styles.cardDesc}>
          {isLocal
            ? 'Simulated local mode only. Device controls and room readings are mock data; no hardware commands are connected.'
            : 'Demo only: device controls and room readings are simulated. The MQTT link carries connectivity-test messages only.'}
        </p>

        <div className={styles.cardDivider}></div>

        {onNavigateToConnections && (
          <button
            type="button"
            className={styles.statusLink}
            onClick={onNavigateToConnections}
          >
            <span>View connection status</span>
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
