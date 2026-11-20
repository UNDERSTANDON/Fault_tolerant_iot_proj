import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import Logo from '../Logo/Logo';
import { useScrollLock } from '../../hooks/useScrollLock';
import styles from './AuthModal.module.css';

export default function AuthModal({ authError, needsBootstrap, onSignIn, onClearError }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const dialogRef = useRef(null);
  const usernameInputRef = useRef(null);

  // Reference-counted scroll lock
  useScrollLock(true);

  useEffect(() => {
    if (usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableSelectors =
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusable = Array.from(dialogRef.current.querySelectorAll(focusableSelectors));
        if (focusable.length === 0) return;

        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];

        if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          firstEl.focus();
          return;
        }

        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSignIn(username, password);
  };

  const handleFillAccount = (targetUser, targetPass) => {
    setUsername(targetUser);
    setPassword(targetPass);
    if (onClearError) onClearError();
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className={styles.dialog} ref={dialogRef}>
        {/* Brand Header */}
        <div className={styles.header}>
          <Logo size="md" />
          <div className={styles.headerText}>
            <h2 id="auth-modal-title" className={styles.title}>
              SafeHaven Access
            </h2>
            <p className={styles.subtitle}>
              Local-First Smart Home · Authentication Required
            </p>
          </div>
        </div>

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="auth-username" className={styles.label}>
              Username
            </label>
            <input
              ref={usernameInputRef}
              id="auth-username"
              type="text"
              className={styles.input}
              placeholder="e.g. admin or visitor"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (authError && onClearError) onClearError();
              }}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="auth-password" className={styles.label}>
              Password
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                className={`${styles.input} ${styles.inputWithIcon}`}
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (authError && onClearError) onClearError();
                }}
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {authError && (
            <div className={styles.errorBox} role="alert">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}

          <button type="submit" className={styles.submitBtn}>
            <span>Sign In to SafeHaven</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className={styles.footerBox}>
          <div className={styles.quickAccountsRow}>
            <span className={styles.quickLabel}>Quick access profiles:</span>
            <div className={styles.quickBtnGroup}>
              <button
                type="button"
                className={styles.quickRoleBtn}
                onClick={() => handleFillAccount('admin', 'admin1234')}
                title="Fill Administrator credentials"
              >
                Admin
              </button>
              <button
                type="button"
                className={styles.quickRoleBtn}
                onClick={() => handleFillAccount('visitor', 'visitor1234')}
                title="Fill Visitor read-only credentials"
              >
                Visitor (Read-Only)
              </button>
            </div>
          </div>

          <div className={styles.lockNotice}>
            <ShieldCheck size={14} />
            <span>
              {needsBootstrap
                ? 'Run npm run setup:admin from local_server to provision host credentials.'
                : 'Sign in with your Administrator or Visitor account to access SafeHaven.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
