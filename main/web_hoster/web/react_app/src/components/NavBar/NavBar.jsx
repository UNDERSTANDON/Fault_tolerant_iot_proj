import { LayoutDashboard, Activity, ShieldAlert, RefreshCw, FlaskConical } from 'lucide-react';
import styles from './NavBar.module.css';

export default function NavBar({ activeScreen, onSelectScreen, currentMode }) {
  const navItems = [
    {
      id: 'DASHBOARD',
      label: 'Dashboard (S1)',
      icon: <LayoutDashboard size={17} />
    },
    {
      id: 'DIAGNOSTICS',
      label: 'Diagnostics (S3)',
      icon: <Activity size={17} />
    },
    {
      id: 'LOCAL_FALLBACK',
      label: 'Local Fallback (S4)',
      icon: <ShieldAlert size={17} />,
      badge: currentMode === 'LOCAL' ? 'ACTIVE' : null
    },
    {
      id: 'RECOVERY',
      label: 'Cloud Sync (S5)',
      icon: <RefreshCw size={17} />
    },
    {
      id: 'RESEARCH_TEST',
      label: 'Research Lab (S6)',
      icon: <FlaskConical size={17} />
    }
  ];

  return (
    <nav className={styles.navBar} aria-label="Main Navigation">
      <div className={styles.navContainer}>
        {navItems.map((item) => {
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.navButton} ${isActive ? styles.active : ''}`}
              onClick={() => onSelectScreen(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge && <span className={styles.badge}>{item.badge}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

