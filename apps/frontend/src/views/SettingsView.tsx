import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiSun,
  FiMoon,
  FiGlobe,
  FiCheck,
  FiMenu,
  FiArrowLeft,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { ViewSidebar } from '../components/ViewSidebar';
import { SUPPORTED_LANGUAGES, changeLanguage, type SupportedLanguage } from '../i18n';
import type { ViewId } from './registry';

const ACTIVE_VIEW_KEY = 'dashlet-active-view';

export function SettingsView() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('dashlet_theme');
    if (saved) return saved === 'dark';
    return true; // Default dark
  });

  useEffect(() => {
    localStorage.setItem('dashlet_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleSelectView = (viewId: ViewId) => {
    localStorage.setItem(ACTIVE_VIEW_KEY, viewId);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top Header */}
      <div className="flex h-11 items-center justify-between border-b border-gray-800 bg-gray-900 px-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            title={t('sidebar.title', 'Views')}
            aria-label={t('sidebar.title', 'Views')}
            aria-haspopup="dialog"
            aria-expanded={sidebarOpen}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 transition-all duration-150 hover:bg-white/5 hover:text-gray-200 active:scale-90"
          >
            <FiMenu size={15} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200"
          >
            <FiArrowLeft size={14} />
            <span>Volver</span>
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('settings.title', 'Settings')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('settings.subtitle', 'Manage your workspace preferences')}</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden p-6 space-y-6">
          {/* Appearance Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 p-2 rounded-lg bg-gray-700 text-amber-400 flex items-center justify-center">
                  {isDarkMode ? <FiMoon size={20} /> : <FiSun size={20} />}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">
                    {t('settings.preferencesTab.appearance.darkMode', 'Dark Mode')}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('settings.preferencesTab.appearance.darkModeDesc', 'Toggle dark or light theme interface')}
                  </p>
                </div>
              </div>

              {/* Accessible Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isDarkMode}
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                  isDarkMode ? 'bg-amber-500' : 'bg-gray-700'
                }`}
              >
                <span className="sr-only">Toggle dark mode</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isDarkMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Language Selection Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 p-2 rounded-lg bg-gray-700 text-blue-400 flex items-center justify-center">
                <FiGlobe size={20} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">
                  {t('settings.preferencesTab.language.title', 'Language')}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('settings.preferencesTab.language.selectLanguageDesc', 'Choose your preferred language across the workspace')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = i18n.language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => changeLanguage(lang.code as SupportedLanguage)}
                    className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/40 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-700/40'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{lang.nativeName}</span>
                      <span className="text-xs text-gray-500">{lang.name}</span>
                    </div>
                    {isSelected && (
                      <FiCheck className="text-amber-400 ml-2" size={16} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ViewSidebar
        open={sidebarOpen}
        activeViewId="widgets"
        onSelect={handleSelectView}
        onClose={() => setSidebarOpen(false)}
      />
    </div>
  );
}
