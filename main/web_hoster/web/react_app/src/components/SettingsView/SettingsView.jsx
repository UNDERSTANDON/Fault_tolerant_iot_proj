import { Sun, Moon, Globe, Check, Monitor, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import styles from './SettingsView.module.css';

export default function SettingsView({ onNotifyPreferenceChange }) {
  const {
    language,
    theme,
    supportedLanguages,
    currentLangMeta,
    setLanguage,
    setTheme,
    t
  } = useLanguage();

  const handleThemeSelect = (nextTheme) => {
    if (nextTheme === theme) return;
    setTheme(nextTheme);
    if (onNotifyPreferenceChange) {
      onNotifyPreferenceChange('theme', nextTheme);
    }
  };

  const handleLanguageSelect = (nextLangCode) => {
    if (nextLangCode === language) return;
    setLanguage(nextLangCode);
    if (onNotifyPreferenceChange) {
      onNotifyPreferenceChange('language', nextLangCode);
    }
  };

  return (
    <div className={styles.container}>
      {/* Top Tag & Header */}
      <div className={styles.topHeader}>
        <span className={styles.screenTag}>{t('settings.screenTag')}</span>
        <h2 className={styles.title}>{t('settings.title')}</h2>
        <p className={styles.subtitle}>{t('settings.subtitle')}</p>
      </div>

      {/* 1. Theme / Appearance Section */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconBox}>
            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </div>
          <div>
            <h3 className={styles.sectionTitle}>{t('settings.themeSectionTitle')}</h3>
            <p className={styles.sectionDesc}>{t('settings.themeSectionDesc')}</p>
          </div>
        </div>

        <div className={styles.themeGrid}>
          {/* Light Mode Card */}
          <button
            type="button"
            className={`${styles.themeOption} ${theme === 'light' ? styles.themeOptionActive : ''}`}
            onClick={() => handleThemeSelect('light')}
            aria-pressed={theme === 'light'}
          >
            <div className={`${styles.themePreview} ${styles.previewLight}`}>
              <div className={styles.previewSidebar} />
              <div className={styles.previewBody}>
                <div className={styles.previewBar} />
                <div className={styles.previewCards}>
                  <span className={styles.previewCardBlock} />
                  <span className={styles.previewCardBlock} />
                </div>
              </div>
            </div>

            <div className={styles.themeMeta}>
              <div className={styles.themeTitleRow}>
                <div className={styles.themeTitleLeft}>
                  <Sun size={17} className={styles.iconLight} />
                  <span className={styles.themeName}>{t('settings.lightModeTitle')}</span>
                </div>
                {theme === 'light' && (
                  <span className={styles.activePill}>
                    <Check size={12} />
                    <span>{t('settings.activeBadge')}</span>
                  </span>
                )}
              </div>
              <p className={styles.themeDesc}>{t('settings.lightModeDesc')}</p>
            </div>
          </button>

          {/* Dark Mode Card */}
          <button
            type="button"
            className={`${styles.themeOption} ${theme === 'dark' ? styles.themeOptionActive : ''}`}
            onClick={() => handleThemeSelect('dark')}
            aria-pressed={theme === 'dark'}
          >
            <div className={`${styles.themePreview} ${styles.previewDark}`}>
              <div className={styles.previewSidebar} />
              <div className={styles.previewBody}>
                <div className={styles.previewBar} />
                <div className={styles.previewCards}>
                  <span className={styles.previewCardBlock} />
                  <span className={styles.previewCardBlock} />
                </div>
              </div>
            </div>

            <div className={styles.themeMeta}>
              <div className={styles.themeTitleRow}>
                <div className={styles.themeTitleLeft}>
                  <Moon size={17} className={styles.iconDark} />
                  <span className={styles.themeName}>{t('settings.darkModeTitle')}</span>
                </div>
                {theme === 'dark' && (
                  <span className={styles.activePill}>
                    <Check size={12} />
                    <span>{t('settings.activeBadge')}</span>
                  </span>
                )}
              </div>
              <p className={styles.themeDesc}>{t('settings.darkModeDesc')}</p>
            </div>
          </button>
        </div>
      </section>

      {/* 2. Language Section (7 Languages) */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconBox}>
            <Globe size={20} />
          </div>
          <div>
            <h3 className={styles.sectionTitle}>{t('settings.langSectionTitle')}</h3>
            <p className={styles.sectionDesc}>{t('settings.langSectionDesc')}</p>
          </div>
        </div>

        <div className={styles.langGrid}>
          {supportedLanguages.map((lang) => {
            const isSelected = lang.code === language;
            return (
              <button
                key={lang.code}
                type="button"
                className={`${styles.langOption} ${isSelected ? styles.langOptionActive : ''}`}
                onClick={() => handleLanguageSelect(lang.code)}
                aria-pressed={isSelected}
              >
                <div className={styles.langTop}>
                  <span className={styles.langCodeBadge}>{lang.code.toUpperCase()}</span>
                  {isSelected && (
                    <span className={styles.activePill}>
                      <Check size={12} />
                      <span>{t('settings.activeBadge')}</span>
                    </span>
                  )}
                </div>
                <span className={styles.langNative}>{lang.nativeName}</span>
                <span className={styles.langRegion}>{lang.name} · {lang.region}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Active Summary Strip */}
      <section className={styles.summaryStrip}>
        <div className={styles.summaryItem}>
          <Monitor size={17} className={styles.summaryIcon} />
          <div>
            <span className={styles.summaryLabel}>{t('settings.currentThemeLabel')}</span>
            <strong className={styles.summaryValue}>
              {theme === 'dark' ? t('settings.darkModeTitle') : t('settings.lightModeTitle')}
            </strong>
          </div>
        </div>

        <div className={styles.summaryItem}>
          <Globe size={17} className={styles.summaryIcon} />
          <div>
            <span className={styles.summaryLabel}>{t('settings.currentLangLabel')}</span>
            <strong className={styles.summaryValue}>
              {currentLangMeta.nativeName} ({currentLangMeta.name})
            </strong>
          </div>
        </div>

        <div className={styles.summaryItem}>
          <ShieldCheck size={17} className={styles.summaryIcon} />
          <div>
            <span className={styles.summaryLabel}>{t('settings.syncStatusLabel')}</span>
            <strong className={styles.summaryValue}>{t('settings.syncStatusVal')}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
