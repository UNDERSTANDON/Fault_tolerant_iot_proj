import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './Notification.module.css';

export default function Notification({ notifications, onDismiss }) {
  const { t } = useLanguage();

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

  const resolveParams = (rawParams = {}) => {
    const resolved = { ...rawParams };
    if (rawParams.deviceId) {
      const translatedDevice = t(`devices.${rawParams.deviceId}`);
      resolved.device = translatedDevice !== `devices.${rawParams.deviceId}`
        ? translatedDevice
        : (rawParams.device || rawParams.deviceId);
    }
    if (rawParams.actionKey) {
      resolved.action = t(rawParams.actionKey);
    }
    if (rawParams.ackKey) {
      resolved.ack = t(rawParams.ackKey, resolved);
    }
    if (rawParams.themeKey) {
      resolved.theme = t(rawParams.themeKey);
    }
    return resolved;
  };

  return (
    <div className={styles.container} aria-live="polite">
      {notifications.map((item) => {
        const params = resolveParams(item.params);
        const titleText = item.titleKey ? t(item.titleKey, params) : item.title;
        const messageText = item.messageKey
          ? t(item.messageKey, params)
          : (params.ack && item.appendLatencyMs !== undefined
            ? `${params.ack} (${item.appendLatencyMs}ms).`
            : item.message);

        return (
          <div
            key={item.id}
            className={`${styles.toast} ${styles[item.type] || styles.info}`}
          >
            <div className={styles.iconBox}>
              {getIcon(item.type)}
            </div>
            <div className={styles.textBox}>
              <span className={styles.title}>{titleText}</span>
              <span className={styles.message}>{messageText}</span>
              {item.time && <span className={styles.time}>{item.time}</span>}
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => onDismiss(item.id)}
              title={t('common.dismiss')}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
