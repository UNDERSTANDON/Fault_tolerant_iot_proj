import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import styles from './UserManagement.module.css';

export default function UserManagement({
  users,
  usersError,
  isLoadingUsers,
  onLoadUsers,
  onCreateVisitor,
  onSetVisitorEnabled
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    onLoadUsers();
  }, [onLoadUsers]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    const created = await onCreateVisitor(username, password);
    if (created) {
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setMessage('Visitor account created.');
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Local user accounts</h1>
        <p>Create visitor accounts for read-only access. Only the administrator can create accounts.</p>
      </header>

      <section className={styles.panel} aria-labelledby="create-user-heading">
        <h2 id="create-user-heading">Create visitor account</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Username</span>
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
            <span>Password</span>
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
            <span>Confirm password</span>
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
            Create visitor
          </button>
        </form>
        {(usersError || message) && (
          <p className={usersError ? styles.error : styles.message} role="status">
            {usersError || message}
          </p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="users-heading">
        <h2 id="users-heading">Existing accounts</h2>
        {isLoadingUsers ? (
          <p className={styles.muted}>Loading accounts…</p>
        ) : users.length === 0 ? (
          <p className={styles.muted}>No accounts found.</p>
        ) : (
          <ul className={styles.userList}>
            {users.map((user) => (
              <li key={user.id}>
                <span>{user.username}</span>
                <span className={styles.role}>{user.role}</span>
                {!user.enabled && <span className={styles.disabled}>Disabled</span>}
                {user.role === 'visitor' && (
                  <button
                    type="button"
                    className={styles.stateButton}
                    onClick={() => onSetVisitorEnabled(user.id, !user.enabled)}
                  >
                    {user.enabled ? 'Disable' : 'Enable'}
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
