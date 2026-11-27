import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck, Sun, Moon, Globe } from 'lucide-react';
import Logo from '../Logo/Logo';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './AuthModal.module.css';

export default function AuthModal({ authError, needsBootstrap, onSignIn, onClearError }) {
  const { language, setLanguage, supportedLanguages, theme, toggleTheme, t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const dialogRef = useRef(null);
  const usernameInputRef = useRef(null);

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
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
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

  const translateAuthError = (err) => {
    if (!err) return '';
    if (err.includes('enter both username and password')) return t('auth.errMissingBoth');
    if (err.includes('Invalid username or password')) return t('auth.errInvalidCredentials');
    if (err.includes('disabled by the administrator')) return t('auth.errVisitorDisabled');
    return err;
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className={styles.dialog} ref={dialogRef}>
        {/* Quick Theme & Language Toolbar on Login Modal */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card-inner)', fontSize: '0.72rem' }}>
            <Globe size={13} color="var(--accent-primary)" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label={t('settings.langSectionTitle')}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', outline: 'none' }}
            >
              {supportedLanguages.map((l) => (
                <option key={l.code} value={l.code} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                  {l.nativeName}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('settings.lightModeTitle') : t('settings.darkModeTitle')}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card-inner)', color: 'var(--text-primary)' }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        {/* Brand Header */}
        <div className={styles.header}>
          <Logo size="md" />
          <div className={styles.headerText}>
            <h2 id="auth-modal-title" className={styles.title}>
              {t('auth.title')}
            </h2>
            <p className={styles.subtitle}>
              {t('auth.subtitle')}
            </p>
          </div>
        </div>

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="auth-username" className={styles.label}>
              {t('auth.username')}
            </label>
            <input
              ref={usernameInputRef}
              id="auth-username"
              type="text"
              className={styles.input}
              placeholder={t('auth.usernamePlaceholder')}
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
              {t('auth.password')}
            </label>
            <div className={styles.inputWrapper}>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                className={`${styles.input} ${styles.inputWithIcon}`}
                placeholder={t('auth.passwordPlaceholder')}
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
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {authError && (
            <div className={styles.errorBox} role="alert">
              <AlertCircle size={16} />
              <span>{translateAuthError(authError)}</span>
            </div>
          )}

          <button type="submit" className={styles.submitBtn}>
            <span>{t('auth.signInBtn')}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className={styles.footerBox}>
          <div className={styles.quickAccountsRow}>
            <span className={styles.quickLabel}>{t('auth.quickProfiles')}</span>
            <div className={styles.quickBtnGroup}>
              <button
                type="button"
                className={styles.quickRoleBtn}
                onClick={() => handleFillAccount('admin', 'admin1234')}
              >
                {t('common.adminShort')}
              </button>
              <button
                type="button"
                className={styles.quickRoleBtn}
                onClick={() => handleFillAccount('visitor', 'visitor1234')}
              >
                {t('auth.visitorReadOnlyBtn')}
              </button>
            </div>
          </div>

          <div className={styles.lockNotice}>
            <ShieldCheck size={14} />
            <span>
              {needsBootstrap
                ? t('auth.bootstrapNotice')
                : t('auth.signInNotice')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
