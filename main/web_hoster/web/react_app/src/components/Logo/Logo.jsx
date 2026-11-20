import styles from './Logo.module.css';

export default function Logo({ size = 'md', showText = false, subtitle = 'LOCAL-FIRST SMART HOME' }) {
  const sizeClass = styles[size] || styles.md;

  return (
    <div className={styles.logoRoot}>
      <div className={`${styles.emblem} ${sizeClass}`} aria-hidden="true">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.svg}
        >
          {/* Outer Protective Shield */}
          <path
            d="M24 4L8 10.5V22.5C8 33.2 14.8 41.8 24 44.5C33.2 41.8 40 33.2 40 22.5V10.5L24 4Z"
            fill="rgba(255, 255, 255, 0.14)"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* Inner Home Roofline */}
          <path
            d="M15.5 23L24 15.5L32.5 23"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Resilience Heartbeat / Signal Pulse Line */}
          <path
            d="M14.5 28.5H19.5L22 24L25.5 32.5L28 28.5H33.5"
            stroke="#A7F3D0"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {showText && (
        <div className={styles.textGroup}>
          <span className={styles.brandTitle}>SafeHaven</span>
          {subtitle && <span className={styles.brandSubtitle}>{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
