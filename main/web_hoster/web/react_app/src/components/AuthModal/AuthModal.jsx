import { useState, useEffect, useRef } from 'react';
import { Home, Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import styles from './AuthModal.module.css';

export default function AuthModal({ authError, onSignIn, onSignUp, onClearError }) {
  const [mode, setMode] = useState('SIGN_IN'); // 'SIGN_IN' | 'SIGN_UP'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const dialogRef = useRef(null);
  const usernameInputRef = useRef(null);

  // Layer 3: Lock background scroll while modal is mounted
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Auto-focus username input on mount and tab switch
  useEffect(() => {
    if (usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, [mode]);

  // Layer 4 & 5: Block Escape key and trap Tab focus within the modal
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

  const handleSwitchMode = (targetMode) => {
    if (targetMode === mode) return;
    setMode(targetMode);
    setPassword('');
    setConfirmPassword('');
    if (onClearError) onClearError();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'SIGN_IN') {
      onSignIn(username, password);
    } else {
      onSignUp(username, password, confirmPassword);
    }
  };

  const handleFillDemo = () => {
    setMode('SIGN_IN');
    setUsername('admin');
    setPassword('admin1234');
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
          <div className={styles.brandIcon}>
            <Home size={22} strokeWidth={2.2} />
          </div>
          <div className={styles.headerText}>
            <h2 id="auth-modal-title" className={styles.title}>
              Smart Home Access
            </h2>
            <p className={styles.subtitle}>
              Fault-Tolerant IoT Interface · Authentication Required
            </p>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className={styles.tabs} role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'SIGN_IN'}
            className={`${styles.tabBtn} ${mode === 'SIGN_IN' ? styles.tabBtnActive : ''}`}
            onClick={() => handleSwitchMode('SIGN_IN')}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'SIGN_UP'}
            className={`${styles.tabBtn} ${mode === 'SIGN_UP' ? styles.tabBtnActive : ''}`}
            onClick={() => handleSwitchMode('SIGN_UP')}
          >
            Create Account
          </button>
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
              placeholder="e.g. admin or homeowner_01"
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
                placeholder={mode === 'SIGN_UP' ? 'At least 6 characters' : 'Enter your password'}
                autoComplete={mode === 'SIGN_IN' ? 'current-password' : 'new-password'}
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

          {mode === 'SIGN_UP' && (
            <div className={styles.field}>
              <label htmlFor="auth-confirm-password" className={styles.label}>
                Confirm Password
              </label>
              <input
                id="auth-confirm-password"
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (authError && onClearError) onClearError();
                }}
                required
              />
            </div>
          )}

          {authError && (
            <div className={styles.errorBox} role="alert">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}

          <button type="submit" className={styles.submitBtn}>
            <span>{mode === 'SIGN_IN' ? 'Sign In to Dashboard' : 'Create Account & Continue'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Demo Helper & Local Storage Footnote */}
        <div className={styles.footerBox}>
          <div className={styles.demoRow}>
            <span>
              Demo account: <span className={styles.demoCode}>admin / admin1234</span>
            </span>
            <button
              type="button"
              className={styles.fillDemoBtn}
              onClick={handleFillDemo}
            >
              Auto-fill
            </button>
          </div>
          <div className={styles.lockNotice}>
            <ShieldCheck size={14} />
            <span>Sign in or create an account to unlock smart home controls</span>
          </div>
        </div>
      </div>
    </div>
  );
}
