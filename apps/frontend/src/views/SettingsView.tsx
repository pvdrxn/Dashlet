import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  FiUser,
  FiLock,
  FiMail,
  FiTrash2,
  FiLogOut,
  FiUsers,
  FiSliders,
  FiSun,
  FiMoon,
  FiGlobe,
  FiCheck,
  FiMenu,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { ChangeEmailForm } from '../components/ChangeEmailForm';
import { DeleteAccountForm } from '../components/DeleteAccountForm';
import { ViewSidebar } from '../components/ViewSidebar';
import * as authApi from '../api/auth';
import { SUPPORTED_LANGUAGES, changeLanguage, type SupportedLanguage } from '../i18n';
import type { SessionDto } from '@widget-master/shared';
import type { ViewId } from './registry';

type SettingsTab = 'profile' | 'preferences' | 'password' | 'email' | 'sessions' | 'danger';

const ACTIVE_VIEW_KEY = 'dashlet-active-view';

export function SettingsView() {
  const { user, refreshUser } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);
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

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'profile',
      label: t('settings.tabs.profile', 'Profile'),
      icon: <FiUser size={18} />,
    },
    {
      id: 'preferences',
      label: t('settings.tabs.preferences', 'Preferences'),
      icon: <FiSliders size={18} />,
    },
    {
      id: 'password',
      label: t('settings.tabs.password', 'Password'),
      icon: <FiLock size={18} />,
    },
    {
      id: 'email',
      label: t('settings.tabs.email', 'Email'),
      icon: <FiMail size={18} />,
    },
    {
      id: 'sessions',
      label: t('settings.tabs.sessions', 'Sessions'),
      icon: <FiUsers size={18} />,
    },
    {
      id: 'danger',
      label: t('settings.tabs.danger', 'Danger Zone'),
      icon: <FiTrash2 size={18} />,
    },
  ];

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      await authApi.revokeSession(sessionId);
      await refreshUser();
    } catch (e) {
      console.error('Failed to revoke session:', e);
    } finally {
      setRevokingSession(null);
    }
  };

  const handleLogoutAll = async () => {
    try {
      await authApi.logout();
      window.location.href = '/login';
    } catch (e) {
      console.error('Failed to logout:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top Header matching app navbar height and position */}
      <div className="flex h-11 items-center border-b border-gray-800 bg-gray-900 px-3">
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
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('settings.title', 'Settings')}</h1>
          <p className="text-sm text-gray-400 mt-1">{t('settings.subtitle', 'Manage your account settings and preferences')}</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="flex flex-col md:flex-row">
            <nav className="w-full md:w-56 border-r border-gray-800 p-4 md:pb-8" aria-label="Settings sections">
              <ul className="space-y-1" role="tablist">
                {tabs.map((tab) => (
                  <li key={tab.id} role="presentation">
                    <button
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === tab.id
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                      }`}
                    >
                      <span className="flex-shrink-0" aria-hidden="true">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Logout button at bottom */}
              <div className="mt-6 pt-4 border-t border-gray-800">
                <button
                  onClick={handleLogoutAll}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors"
                >
                  <FiLogOut size={18} aria-hidden="true" />
                  <span>{t('common.signOutEverywhere', 'Sign Out Everywhere')}</span>
                </button>
              </div>
            </nav>

            {/* Content Panels */}
            <div className="flex-1 p-6 md:p-8 overflow-y-auto">
              {activeTab === 'profile' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="profile-tab">
                  <h2 className="text-xl font-semibold text-white">{t('settings.profileTab.title', 'Profile')}</h2>
                  <p className="text-gray-400">{t('settings.profileTab.subtitle', 'Your account information')}</p>

                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-blue-900/30 flex items-center justify-center">
                        <FiUser size={32} className="text-blue-400" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-white">{user?.username ?? user?.email}</h3>
                        <p className="text-sm text-gray-400">
                          {t('settings.profileTab.memberSince', 'Member since')} {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-center gap-3 text-gray-400 mb-1">
                        <FiMail size={18} aria-hidden="true" />
                        <span className="text-sm font-medium">{t('settings.profileTab.email', 'Email')}</span>
                      </div>
                      <p className="text-white">{user?.email}</p>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-center gap-3 text-gray-400 mb-1">
                        <FiUser size={18} aria-hidden="true" />
                        <span className="text-sm font-medium">{t('settings.profileTab.userId', 'User ID')}</span>
                      </div>
                      <p className="text-white font-mono text-sm">{user?.id}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'preferences' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="preferences-tab">
                  <div>
                    <h2 className="text-xl font-semibold text-white tracking-tight">
                      {t('settings.preferencesTab.title', 'Preferences')}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                      {t('settings.preferencesTab.subtitle', 'Customize appearance and language settings')}
                    </p>
                  </div>

                  {/* Dark Mode Preference Card */}
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
              )}

              {activeTab === 'password' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="password-tab">
                  <h2 className="text-xl font-semibold text-white">{t('settings.passwordTab.title', 'Change Password')}</h2>
                  <p className="text-gray-400">{t('settings.passwordTab.subtitle', 'Update your password. You will be logged out of other sessions.')}</p>
                  <ChangePasswordForm />
                </div>
              )}

              {activeTab === 'email' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="email-tab">
                  <h2 className="text-xl font-semibold text-white">{t('settings.emailTab.title', 'Change Email')}</h2>
                  <p className="text-gray-400">{t('settings.emailTab.subtitle', 'Update your email address. You will be logged out of all sessions.')}</p>
                  <ChangeEmailForm />
                </div>
              )}

              {activeTab === 'sessions' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="sessions-tab">
                  <h2 className="text-xl font-semibold text-white flex items-center justify-between">
                    {t('settings.sessionsTab.title', 'Active Sessions')}
                    <span className="text-sm text-gray-400 font-normal">{t('settings.sessionsTab.subtitle', "Manage where you're logged in")}</span>
                  </h2>
                  <SessionsList onRevoke={handleRevokeSession} revokingId={revokingSession} />
                </div>
              )}

              {activeTab === 'danger' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="danger-tab">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <FiTrash2 size={22} className="text-red-400" aria-hidden="true" />
                    {t('settings.dangerTab.title', 'Danger Zone')}
                  </h2>
                  <p className="text-gray-400">{t('settings.dangerTab.subtitle', 'Irreversible actions. Please proceed with caution.')}</p>

                  <div className="bg-gray-800/50 border border-red-900/50 rounded-xl p-6">
                    <h3 className="text-lg font-medium text-red-300 mb-3 flex items-center gap-2">
                      <FiTrash2 size={20} aria-hidden="true" />
                      {t('settings.dangerTab.deleteTitle', 'Delete Account')}
                    </h3>
                    <p className="text-gray-400 mb-4">
                      {t('settings.dangerTab.deleteDesc', 'Permanently delete your account and all associated data. This action cannot be undone.')}
                    </p>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
                    >
                      {t('settings.dangerTab.deleteButton', 'Delete Account')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ViewSidebar drawer */}
      <ViewSidebar
        open={sidebarOpen}
        activeViewId={
          (localStorage.getItem(ACTIVE_VIEW_KEY) as ViewId) || 'widgets'
        }
        onSelect={handleSelectView}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <FiTrash2 size={22} className="text-red-400" aria-hidden="true" />
                {t('settings.dangerTab.deleteTitle', 'Delete Account')}
              </h2>
              <DeleteAccountForm onClose={() => setShowDeleteModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionsList({ onRevoke, revokingId }: { onRevoke: (id: string) => void; revokingId: string | null }) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.getSessions()
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
      {loading ? (
        <div className="p-6 text-center text-gray-400">{t('settings.sessionsTab.loading', 'Loading sessions...')}</div>
      ) : sessions.length === 0 ? (
        <div className="p-6 text-center text-gray-400">{t('settings.sessionsTab.empty', 'No active sessions')}</div>
      ) : (
        <ul className="divide-y divide-gray-700" role="list">
          {sessions.map((session) => (
            <li key={session.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                  <FiUsers size={20} className="text-gray-400" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-white font-medium">
                    {session.id === revokingId
                      ? t('settings.sessionsTab.current', 'Current Session')
                      : t('settings.sessionsTab.active', 'Active Session')}
                  </p>
                  <p className="text-sm text-gray-400">
                    {t('settings.sessionsTab.started', 'Started')} {new Date(session.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {session.id !== revokingId && (
                <button
                  onClick={() => onRevoke(session.id)}
                  disabled={revokingId === session.id}
                  className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
                >
                  {t('common.revoke', 'Revoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
