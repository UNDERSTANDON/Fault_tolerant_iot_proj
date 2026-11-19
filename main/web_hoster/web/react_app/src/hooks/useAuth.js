import { useState, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_LOCAL_SERVER_URL
  || (import.meta.env.VITE_LAN_BRIDGE_URL || '')
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
  || 'http://localhost:8081';
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(parsed.error || parsed.message || 'Request failed.');
  }

  return parsed;
}

export function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [preferences, setPreferences] = useState({ theme: 'light' });
  const [settingsError, setSettingsError] = useState('');
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const loadSettings = useCallback(async (shouldApply = () => true) => {
    try {
      const data = await requestJson('/api/settings/me');
      if (!shouldApply()) return true;
      setPreferences(data.preferences || { theme: 'light' });
      setSettingsError('');
      return true;
    } catch {
      if (shouldApply()) {
        setSettingsError('Unable to load your account settings from the local server.');
      }
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;

    requestJson('/api/auth/session')
      .then(async (data) => {
        if (!active) return;
        setNeedsBootstrap(Boolean(data.needsBootstrap));
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          await loadSettings(() => active);
        } else {
          setCurrentUser(null);
          setPreferences({ theme: 'light' });
        }
      })
      .catch(() => {
        if (active) {
          setCurrentUser(null);
          setNeedsBootstrap(false);
          setAuthError('Unable to contact the local authentication server.');
        }
      })
      .finally(() => {
        if (active) {
          setIsCheckingSession(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadSettings]);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setUsersError('');
    try {
      const data = await requestJson('/api/admin/users');
      setUsers(data.users || []);
      return true;
    } catch (error) {
      setUsersError(error.message || 'Unable to load local users.');
      return false;
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const createVisitor = useCallback(async (usernameInput, passwordInput) => {
    const username = (usernameInput || '').trim();
    const password = passwordInput || '';
    if (!USERNAME_REGEX.test(username)) {
      setUsersError('Username must be 3–20 characters (letters, numbers, underscore).');
      return false;
    }
    if (password.length < 8) {
      setUsersError('Password must be at least 8 characters.');
      return false;
    }

    setUsersError('');
    try {
      const data = await requestJson('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setUsers((previousUsers) => [...previousUsers, data.user]);
      return true;
    } catch (error) {
      setUsersError(error.message || 'Unable to create visitor account.');
      return false;
    }
  }, []);

  const setVisitorEnabled = useCallback(async (userId, enabled) => {
    setUsersError('');
    try {
      const action = enabled ? 'enable' : 'disable';
      const data = await requestJson(`/api/admin/users/${encodeURIComponent(userId)}/${action}`, {
        method: 'POST'
      });
      setUsers((previousUsers) => previousUsers.map((user) => (
        user.id === data.user.id ? data.user : user
      )));
      return true;
    } catch (error) {
      setUsersError(error.message || 'Unable to update visitor account.');
      return false;
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthError('');
  }, []);

  const signIn = useCallback(async (usernameInput, passwordInput) => {
    const username = (usernameInput || '').trim();
    const password = passwordInput || '';

    if (!username || !password) {
      setAuthError('Please enter both username and password.');
      return false;
    }

    try {
      const data = await requestJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setCurrentUser(data.user || null);
      setNeedsBootstrap(false);
      setAuthError('');
      await loadSettings();
      return true;
    } catch (error) {
      setAuthError(error.message || 'Unable to sign in.');
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await requestJson('/api/auth/logout', { method: 'POST' });
      setAuthError('');
    } catch {
      setAuthError('Could not confirm sign-out with the local server. The session may remain active until it expires.');
    }
    setCurrentUser(null);
    setPreferences({ theme: 'light' });
    setSettingsError('');
  }, []);

  return {
    currentUser,
    isAuthenticated: Boolean(currentUser),
    authError,
    isCheckingSession,
    needsBootstrap,
    preferences,
    settingsError,
    users,
    usersError,
    isLoadingUsers,
    loadUsers,
    createVisitor,
    setVisitorEnabled,
    signIn,
    signOut,
    loadSettings,
    clearError
  };
}
