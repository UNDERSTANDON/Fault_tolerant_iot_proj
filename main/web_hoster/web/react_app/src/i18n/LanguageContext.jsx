/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { SUPPORTED_LANGUAGES, TRANSLATIONS } from './translations';

const PREFS_STORAGE_KEY = 'safehaven_preferences_v1';
const PREFS_CHANNEL_NAME = 'safehaven_prefs_sync';

const VALID_LANG_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

function loadStoredPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { theme: 'light', language: 'en' };
    const parsed = JSON.parse(raw);
    return {
      theme: parsed?.theme === 'dark' ? 'dark' : 'light',
      language: VALID_LANG_CODES.has(parsed?.language) ? parsed.language : 'en'
    };
  } catch {
    return { theme: 'light', language: 'en' };
  }
}

function saveStoredPreferences(prefs) {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

function resolvePath(dict, keyPath) {
  if (!dict || !keyPath) return undefined;
  const parts = keyPath.split('.');
  let current = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function interpolate(template, params = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(params, key) && params[key] !== undefined
      ? String(params[key])
      : `{${key}}`
  );
}

export function translateWithLang(langCode, keyPath, params = {}) {
  const activeDict = TRANSLATIONS[langCode] || TRANSLATIONS.en;
  let template = resolvePath(activeDict, keyPath);
  if (template === undefined) {
    template = resolvePath(TRANSLATIONS.en, keyPath);
  }
  if (typeof template !== 'string') {
    return keyPath;
  }
  return interpolate(template, params);
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children, onSyncPreferences }) {
  const [prefs, setPrefs] = useState(loadStoredPreferences);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', prefs.theme);
      document.documentElement.style.colorScheme = prefs.theme;
      document.documentElement.setAttribute('lang', prefs.language);
    }
  }, [prefs.theme, prefs.language]);

  useEffect(() => {
    let channel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(PREFS_CHANNEL_NAME);
        channel.onmessage = (event) => {
          const data = event.data;
          if (data && data.type === 'PREFS_UPDATED' && data.prefs) {
            const nextTheme = data.prefs.theme === 'dark' ? 'dark' : 'light';
            const nextLang = VALID_LANG_CODES.has(data.prefs.language) ? data.prefs.language : 'en';
            setPrefs({ theme: nextTheme, language: nextLang });
          }
        };
      }
    } catch {
      // Ignore BroadcastChannel errors
    }

    const handleStorage = (event) => {
      if (event.key === PREFS_STORAGE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          const nextTheme = parsed?.theme === 'dark' ? 'dark' : 'light';
          const nextLang = VALID_LANG_CODES.has(parsed?.language) ? parsed.language : 'en';
          setPrefs({ theme: nextTheme, language: nextLang });
        } catch {
          // Ignore malformed JSON
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
    };
  }, []);

  const broadcastUpdate = useCallback((nextPrefs) => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(PREFS_CHANNEL_NAME);
        ch.postMessage({ type: 'PREFS_UPDATED', prefs: nextPrefs });
        ch.close();
      }
    } catch {
      // Ignore BroadcastChannel errors
    }
  }, []);

  const setLanguage = useCallback((nextLang) => {
    if (!VALID_LANG_CODES.has(nextLang)) return;
    setPrefs((prev) => {
      const updated = { ...prev, language: nextLang };
      saveStoredPreferences(updated);
      broadcastUpdate(updated);
      if (onSyncPreferences) onSyncPreferences(updated);
      return updated;
    });
  }, [broadcastUpdate, onSyncPreferences]);

  const setTheme = useCallback((nextTheme) => {
    const normalized = nextTheme === 'dark' ? 'dark' : 'light';
    setPrefs((prev) => {
      const updated = { ...prev, theme: normalized };
      saveStoredPreferences(updated);
      broadcastUpdate(updated);
      if (onSyncPreferences) onSyncPreferences(updated);
      return updated;
    });
  }, [broadcastUpdate, onSyncPreferences]);

  const toggleTheme = useCallback(() => {
    setTheme(prefs.theme === 'dark' ? 'light' : 'dark');
  }, [prefs.theme, setTheme]);

  const t = useCallback((keyPath, params = {}) => {
    return translateWithLang(prefs.language, keyPath, params);
  }, [prefs.language]);

  const translateSource = useCallback((rawSource) => {
    if (!rawSource || rawSource === 'No Data (ESP32-S3)' || rawSource === 'No Data') {
      return t('common.noDataEsp');
    }
    if (rawSource === 'ESP32-S3 Live' || rawSource === 'Hardware Live') {
      return t('common.espLive');
    }
    if (rawSource.includes('DHT11') && rawSource.includes('Live')) {
      return t('common.espLiveDht');
    }
    if (rawSource.includes('MQ-2') && rawSource.includes('Live')) {
      return t('common.espLiveMq2');
    }
    if (rawSource === 'No Data (DHT11)') return t('common.noDataDht');
    if (rawSource === 'No Data (MQ-2)') return t('common.noDataMq2');
    if (rawSource === 'Hardware Standby') return t('common.hwStandby');
    return rawSource;
  }, [t]);

  const translateSensorValue = useCallback((val) => {
    if (typeof val === 'number') return val;
    if (!val || val === 'No Data' || val === 'No Signal') return t('common.noData');
    if (val === 'Connected' || val === 'Active') return t('common.connected');
    if (val === 'Clear') return t('sensors.clearPct', { pct: 0 });
    const clearMatch = String(val).match(/^Clear \((\d+)%\)$/i);
    if (clearMatch) return t('sensors.clearPct', { pct: clearMatch[1] });
    const preheatMatch = String(val).match(/^Preheating \((\d+)%\)$/i);
    if (preheatMatch) return t('sensors.preheatingPct', { pct: preheatMatch[1] });
    const smokeMatch = String(val).match(/^SMOKE \((\d+)%\)$/i);
    if (smokeMatch) return t('sensors.smokePct', { pct: smokeMatch[1] });
    if (val === 'SMOKE DETECTED!') return t('sensors.smokePct', { pct: 100 });
    return val;
  }, [t]);

  const translateSensorStatus = useCallback((status) => {
    switch (status) {
      case 'NORMAL': return t('common.normal');
      case 'ALERT': return t('common.hazardAlert');
      case 'PREHEATING': return t('common.preheating');
      case 'NO DATA':
      case 'STANDBY':
        return t('common.noDataStatus');
      case 'ONLINE': return t('common.online');
      case 'OFFLINE': return t('common.offline');
      default: return status || t('common.noDataStatus');
    }
  }, [t]);

  const translateRoom = useCallback((room) => {
    if (!room) return room;
    return {
      ...room,
      name: t(`rooms.${room.id}.name`) !== `rooms.${room.id}.name` ? t(`rooms.${room.id}.name`) : room.name,
      description: t(`rooms.${room.id}.description`) !== `rooms.${room.id}.description` ? t(`rooms.${room.id}.description`) : room.description,
      devices: (room.devices || []).map((dev) => ({
        ...dev,
        name: t(`devices.${dev.id}`) !== `devices.${dev.id}` ? t(`devices.${dev.id}`) : dev.name
      })),
      sensors: (room.sensors || []).map((sen) => ({
        ...sen,
        name: t(`sensors.${sen.id}`) !== `sensors.${sen.id}` ? t(`sensors.${sen.id}`) : sen.name,
        displayValue: translateSensorValue(sen.value),
        displayStatus: translateSensorStatus(sen.status),
        displaySource: translateSource(sen.source)
      }))
    };
  }, [t, translateSensorValue, translateSensorStatus, translateSource]);

  const currentLangMeta = useMemo(
    () => SUPPORTED_LANGUAGES.find((l) => l.code === prefs.language) || SUPPORTED_LANGUAGES[0],
    [prefs.language]
  );

  const value = useMemo(() => ({
    language: prefs.language,
    locale: currentLangMeta.locale,
    currentLangMeta,
    supportedLanguages: SUPPORTED_LANGUAGES,
    theme: prefs.theme,
    setLanguage,
    setTheme,
    toggleTheme,
    t,
    translateSource,
    translateSensorValue,
    translateSensorStatus,
    translateRoom
  }), [
    prefs.language,
    prefs.theme,
    currentLangMeta,
    setLanguage,
    setTheme,
    toggleTheme,
    t,
    translateSource,
    translateSensorValue,
    translateSensorStatus,
    translateRoom
  ]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
