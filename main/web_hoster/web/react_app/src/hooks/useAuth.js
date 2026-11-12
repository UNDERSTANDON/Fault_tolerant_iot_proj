import { useState, useCallback } from 'react';

const USERS_STORAGE_KEY = 'sh_users';
const SESSION_STORAGE_KEY = 'sh_session';

const DEFAULT_DEMO_USER = {
  username: 'admin',
  password: 'admin1234',
  createdAt: 1731373200000
};

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      const initial = [DEFAULT_DEMO_USER];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const initial = [DEFAULT_DEMO_USER];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const hasDemo = parsed.some(
      (u) => u && typeof u.username === 'string' && u.username.toLowerCase() === DEFAULT_DEMO_USER.username
    );
    if (!hasDemo) {
      const merged = [DEFAULT_DEMO_USER, ...parsed];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
    return parsed;
  } catch {
    return [DEFAULT_DEMO_USER];
  }
}

function saveUsers(users) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // Ignore storage write errors in restricted browsing modes
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string' && parsed.username.trim().length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export function useAuth() {
  const [currentUser, setCurrentUser] = useState(() => loadSession());
  const [authError, setAuthError] = useState('');

  const clearError = useCallback(() => {
    setAuthError('');
  }, []);

  const signIn = useCallback((usernameInput, passwordInput) => {
    const username = (usernameInput || '').trim();
    const password = passwordInput || '';

    if (!username || !password) {
      setAuthError('Please enter both username and password.');
      return false;
    }

    const users = loadUsers();
    const matched = users.find(
      (u) =>
        u &&
        typeof u.username === 'string' &&
        u.username.toLowerCase() === username.toLowerCase() &&
        u.password === password
    );

    if (!matched) {
      setAuthError('Invalid username or password.');
      return false;
    }

    const session = {
      username: matched.username,
      signedInAt: Date.now()
    };
    saveSession(session);
    setCurrentUser(session);
    setAuthError('');
    return true;
  }, []);

  const signUp = useCallback((usernameInput, passwordInput, confirmPasswordInput) => {
    const username = (usernameInput || '').trim();
    const password = passwordInput || '';
    const confirmPassword = confirmPasswordInput || '';

    if (!USERNAME_REGEX.test(username)) {
      setAuthError('Username must be 3–20 characters (letters, numbers, underscore).');
      return false;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return false;
    }

    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return false;
    }

    const users = loadUsers();
    const exists = users.some(
      (u) => u && typeof u.username === 'string' && u.username.toLowerCase() === username.toLowerCase()
    );

    if (exists) {
      setAuthError('This username is already taken.');
      return false;
    }

    const newUser = {
      username,
      password,
      createdAt: Date.now()
    };
    const updatedUsers = [...users, newUser];
    saveUsers(updatedUsers);

    const session = {
      username: newUser.username,
      signedInAt: Date.now()
    };
    saveSession(session);
    setCurrentUser(session);
    setAuthError('');
    return true;
  }, []);

  const signOut = useCallback(() => {
    saveSession(null);
    setCurrentUser(null);
    setAuthError('');
  }, []);

  return {
    currentUser,
    isAuthenticated: Boolean(currentUser),
    authError,
    signIn,
    signUp,
    signOut,
    clearError
  };
}
