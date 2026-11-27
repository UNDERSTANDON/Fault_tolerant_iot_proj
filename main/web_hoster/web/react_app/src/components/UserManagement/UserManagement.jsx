import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './UserManagement.module.css';

export default function UserManagement({
  users,
  usersError,
  isLoadingUsers,
  onLoadUsers,
  onCreateVisitor,
  onSetVisitorEnabled
}) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [messageKey, setMessageKey] = useState('');

  useEffect(() => {
    onLoadUsers();
  }, [onLoadUsers]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessageKey('');
    if (password !== confirmPassword) {
      setMessageKey('usersView.errMismatch');
      return;
    }

    const created = await onCreateVisitor(username, password);
    if (created) {
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setMessageKey('usersView.msgCreated');
    }
  };

  const translateUserError = (err) => {
    if (!err) return '';
    if (err.includes('3–20') || err.includes('3-20')) return t('auth.errUsernameFormat');
    if (err.includes('at least')) return t('auth.errPasswordLength');
    if (err.includes('already')) return t('auth.errUsernameTaken');
    if (err.includes('load local users')) return t('auth.errLoadUsers');
    if (err.includes('create visitor')) return t('auth.errCreateVisitor');
    if (err.includes('update visitor')) return t('auth.errUpdateVisitor');
    return err;
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{t('usersView.title')}</h1>
        <p>{t('usersView.subtitle')}</p>
      </header>

      <section className={styles.panel} aria-labelledby="create-user-heading">
        <h2 id="create-user-heading">{t('usersView.createHeading')}</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>{t('usersView.username')}</span>
            <input
              autoComplete="off"
              maxLength={20}
              minLength={3}
              pattern="[a-zA-Z0-9_]{3,20}"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('usersView.password')}</span>
            <input
              autoComplete="new-password"
              minLength={8}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>{t('usersView.confirmPassword')}</span>
            <input
              autoComplete="new-password"
              minLength={8}
              required
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <button type="submit" className={styles.submit}>
            <UserPlus size={16} />
            {t('usersView.createBtn')}
          </button>
        </form>
        {(usersError || messageKey) && (
          <p className={usersError ? styles.error : styles.message} role="status">
            {usersError ? translateUserError(usersError) : t(messageKey)}
          </p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="users-heading">
        <h2 id="users-heading">{t('usersView.existingHeading')}</h2>
        {isLoadingUsers ? (
          <p className={styles.muted}>{t('usersView.loading')}</p>
        ) : users.length === 0 ? (
          <p className={styles.muted}>{t('usersView.noAccounts')}</p>
        ) : (
          <ul className={styles.userList}>
            {users.map((user) => (
              <li key={user.id}>
                <span>{user.username}</span>
                <span className={styles.role}>
                  {user.role === 'admin' ? t('common.administrator') : t('common.visitor')}
                </span>
                {!user.enabled && <span className={styles.disabled}>{t('usersView.disabledBadge')}</span>}
                {user.role === 'visitor' && (
                  <button
                    type="button"
                    className={styles.stateButton}
                    onClick={() => onSetVisitorEnabled(user.id, !user.enabled)}
                  >
                    {user.enabled ? t('usersView.disableBtn') : t('usersView.enableBtn')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
