import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import styles from './Notification.module.css';

export default function Notification({ notifications, onDismiss }) {
  if (!notifications || notifications.length === 0) return null;

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} className={styles.iconSuccess} />;
      case 'warning':
        return <AlertTriangle size={18} className={styles.iconWarning} />;
      case 'error':
        return <AlertCircle size={18} className={styles.iconError} />;
      case 'info':
      default:
        return <Info size={18} className={styles.iconInfo} />;
    }
  };

  return (
    <div className={styles.container} aria-live="polite">
      {notifications.map((item) => (
        <div
          key={item.id}
          className={`${styles.toast} ${styles[item.type] || styles.info}`}
        >
          <div className={styles.iconBox}>
            {getIcon(item.type)}
          </div>
          <div className={styles.textBox}>
            <span className={styles.title}>{item.title}</span>
            <span className={styles.message}>{item.message}</span>
            {item.time && <span className={styles.time}>{item.time}</span>}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => onDismiss(item.id)}
            title="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

