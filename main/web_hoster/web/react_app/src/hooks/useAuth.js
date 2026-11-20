import { useState, useCallback, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_LOCAL_SERVER_URL
  || (import.meta.env.VITE_LAN_BRIDGE_URL || '')
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
  || 'http://localhost:8081';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const LOCAL_USERS_KEY = 'safehaven_users_v1';
const LOCAL_SESSION_KEY = 'safehaven_session_v1';
const LOGOUT_SIGNAL_KEY = 'safehaven_logout_signal';
const AUTH_CHANNEL_NAME = 'safehaven_auth_sync';

const DEFAULT_LOCAL_USERS = [
  {
    id: 'admin-default',
    username: 'admin',
    password: 'admin1234',
    role: 'admin',
    enabled: true,
    createdAt: 1731373200000
  },
  {
    id: 'visitor-default',
    username: 'visitor',
    password: 'visitor1234',
    role: 'visitor',
    enabled: true,
    createdAt: 1731373201000
  }
];

function loadLocalUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(DEFAULT_LOCAL_USERS));
      return DEFAULT_LOCAL_USERS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(DEFAULT_LOCAL_USERS));
      return DEFAULT_LOCAL_USERS;
    }
    let updated = [...parsed];
    for (const seed of DEFAULT_LOCAL_USERS) {
      if (!updated.some((u) => u && u.username?.toLowerCase() === seed.username)) {
        updated.push(seed);
      }
    }
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return DEFAULT_LOCAL_USERS;
  }
}

function saveLocalUsers(users) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // Ignore storage errors
  }
}

function stripSecrets(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || 'visitor',
    enabled: user.enabled !== false,
    createdAt: user.createdAt
  };
}

function loadLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string') {
      const users = loadLocalUsers();
      const matched = users.find(
        (u) => u.username.toLowerCase() === parsed.username.toLowerCase() && u.enabled !== false
      );
      if (matched) return stripSecrets(matched);
    }
    return null;
  } catch {
    return null;
  }
}

function saveLocalSession(user) {
  try {
    if (user) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(stripSecrets(user)));
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

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
    const err = new Error(parsed.error || parsed.message || 'Request failed.');
    err.isHttpError = true;
    throw err;
  }

  return parsed;
}

export function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [preferences, setPreferences] = useState({ theme: 'light' });
  const [settingsError, setSettingsError] = useState('');
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const useLocalVaultRef = useRef(false);
  const broadcastRef = useRef(null);

  const broadcastAuthEvent = useCallback((type, payload = {}) => {
    try {
      if (broadcastRef.current) {
        broadcastRef.current.postMessage({ type, ...payload, timestamp: Date.now() });
      }
      if (type === 'SIGN_OUT') {
        localStorage.setItem(LOGOUT_SIGNAL_KEY, String(Date.now()));
      }
    } catch {
      // Ignore BroadcastChannel or storage errors
    }
  }, []);

  useEffect(() => {
    let channel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
        broadcastRef.current = channel;
        channel.onmessage = (event) => {
          if (event.data?.type === 'SIGN_OUT') {
            saveLocalSession(null);
            setCurrentUser(null);
            setPreferences({ theme: 'light' });
            setSettingsError('');
            setAuthError('');
          } else if (event.data?.type === 'SIGN_IN' && event.data?.user) {
            setCurrentUser(event.data.user);
            setAuthError('');
          }
        };
      }
    } catch {
      // Ignore if BroadcastChannel is unsupported
    }

    const handleStorage = (event) => {
      if (event.key === LOGOUT_SIGNAL_KEY || (event.key === LOCAL_SESSION_KEY && !event.newValue)) {
        setCurrentUser(null);
        setPreferences({ theme: 'light' });
        setSettingsError('');
        setAuthError('');
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        channel.close();
        broadcastRef.current = null;
      }
    };
  }, []);

  const loadSettings = useCallback(async (shouldApply = () => true) => {
    if (useLocalVaultRef.current) {
      if (shouldApply()) {
        setPreferences({ theme: 'light' });
        setSettingsError('');
      }
      return true;
    }
    try {
      const data = await requestJson('/api/settings/me');
      if (!shouldApply()) return true;
      setPreferences(data.preferences || { theme: 'light' });
      setSettingsError('');
      return true;
    } catch {
      if (shouldApply()) {
        setSettingsError('');
      }
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;

    requestJson('/api/auth/session')
      .then(async (data) => {
        if (!active) return;
        useLocalVaultRef.current = false;
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
        if (!active) return;
        // Fallback seamlessly to Local Vault mode when local_server is offline
        useLocalVaultRef.current = true;
        setNeedsBootstrap(false);
        const restored = loadLocalSession();
        setCurrentUser(restored);
        setAuthError('');
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
    if (useLocalVaultRef.current) {
      const localList = loadLocalUsers().map(stripSecrets);
      setUsers(localList);
      setIsLoadingUsers(false);
      return true;
    }
    try {
      const data = await requestJson('/api/admin/users');
      setUsers(data.users || []);
      return true;
    } catch (error) {
      if (!error.isHttpError) {
        useLocalVaultRef.current = true;
        setUsers(loadLocalUsers().map(stripSecrets));
        return true;
      }
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
    if (password.length < 6) {
      setUsersError('Password must be at least 6 characters.');
      return false;
    }

    setUsersError('');
    if (useLocalVaultRef.current) {
      const existing = loadLocalUsers();
      if (existing.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        setUsersError('This username is already taken.');
        return false;
      }
      const created = {
        id: `visitor-${Date.now()}`,
        username,
        password,
        role: 'visitor',
        enabled: true,
        createdAt: Date.now()
      };
      const next = [...existing, created];
      saveLocalUsers(next);
      setUsers(next.map(stripSecrets));
      return true;
    }

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
    if (useLocalVaultRef.current) {
      const existing = loadLocalUsers();
      const next = existing.map((u) => (u.id === userId && u.role === 'visitor' ? { ...u, enabled } : u));
      saveLocalUsers(next);
      setUsers(next.map(stripSecrets));
      return true;
    }

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

    if (!useLocalVaultRef.current) {
      try {
        const data = await requestJson('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });
        const signedInUser = data.user || null;
        setCurrentUser(signedInUser);
        setNeedsBootstrap(false);
        setAuthError('');
        await loadSettings();
        broadcastAuthEvent('SIGN_IN', { user: signedInUser });
        return true;
      } catch (error) {
        if (error.isHttpError) {
          setAuthError(error.message || 'Invalid username or password.');
          return false;
        }
        // Network failure -> fall back to Local Vault
        useLocalVaultRef.current = true;
      }
    }

    const localUsers = loadLocalUsers();
    const matched = localUsers.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (!matched) {
      setAuthError('Invalid username or password.');
      return false;
    }
    if (matched.enabled === false) {
      setAuthError('This visitor account has been disabled by the administrator.');
      return false;
    }

    const sessionUser = stripSecrets(matched);
    saveLocalSession(sessionUser);
    setCurrentUser(sessionUser);
    setNeedsBootstrap(false);
    setAuthError('');
    broadcastAuthEvent('SIGN_IN', { user: sessionUser });
    return true;
  }, [broadcastAuthEvent, loadSettings]);

  const signOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      if (!useLocalVaultRef.current) {
        await requestJson('/api/auth/logout', { method: 'POST' });
      }
      setAuthError('');
    } catch {
      // Clear local session regardless of server reachability
    } finally {
      saveLocalSession(null);
      setCurrentUser(null);
      setPreferences({ theme: 'light' });
      setSettingsError('');
      setIsSigningOut(false);
      broadcastAuthEvent('SIGN_OUT');
    }
  }, [broadcastAuthEvent]);

  return {
    currentUser,
    isAuthenticated: Boolean(currentUser),
    authError,
    isCheckingSession,
    isSigningOut,
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
