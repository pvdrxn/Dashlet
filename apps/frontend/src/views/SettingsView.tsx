import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { FiUser, FiLock, FiMail, FiTrash2, FiLogOut, FiUsers } from 'react-icons/fi';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { ChangeEmailForm } from '../components/ChangeEmailForm';
import { DeleteAccountForm } from '../components/DeleteAccountForm';
import * as authApi from '../api/auth';
import type { SessionDto } from '@widget-master/shared';

type SettingsTab = 'profile' | 'password' | 'email' | 'sessions' | 'danger';

export function SettingsView() {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; description: string }[] = [
    {
      id: 'profile',
      label: 'Profile',
      icon: <FiUser size={18} />,
      description: 'View your account information',
    },
    {
      id: 'password',
      label: 'Password',
      icon: <FiLock size={18} />,
      description: 'Change your password',
    },
    {
      id: 'email',
      label: 'Email',
      icon: <FiMail size={18} />,
      description: 'Update your email address',
    },
    {
      id: 'sessions',
      label: 'Sessions',
      icon: <FiUsers size={18} />,
      description: 'Manage active sessions',
    },
    {
      id: 'danger',
      label: 'Danger Zone',
      icon: <FiTrash2 size={18} />,
      description: 'Delete your account',
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
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-gray-400 mt-1">Manage your account settings and preferences</p>
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
                          ? 'bg-blue-900/30 text-blue-300 border border-blue-800'
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
                  <span>Sign Out Everywhere</span>
                </button>
              </div>
            </nav>

            {/* Content Panels */}
            <div className="flex-1 p-6 md:p-8 overflow-y-auto">
              {activeTab === 'profile' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="profile-tab">
                  <h2 className="text-xl font-semibold text-white">Profile</h2>
                  <p className="text-gray-400">Your account information</p>

                  <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-blue-900/30 flex items-center justify-center">
                        <FiUser size={32} className="text-blue-400" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-white">{user?.email}</h3>
                        <p className="text-sm text-gray-400">
                          Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-center gap-3 text-gray-400 mb-1">
                        <FiMail size={18} aria-hidden="true" />
                        <span className="text-sm font-medium">Email</span>
                      </div>
                      <p className="text-white">{user?.email}</p>
                    </div>
                    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-center gap-3 text-gray-400 mb-1">
                        <FiUser size={18} aria-hidden="true" />
                        <span className="text-sm font-medium">User ID</span>
                      </div>
                      <p className="text-white font-mono text-sm">{user?.id}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'password' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="password-tab">
                  <h2 className="text-xl font-semibold text-white">Change Password</h2>
                  <p className="text-gray-400">Update your password. You will be logged out of other sessions.</p>
                  <ChangePasswordForm />
                </div>
              )}

              {activeTab === 'email' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="email-tab">
                  <h2 className="text-xl font-semibold text-white">Change Email</h2>
                  <p className="text-gray-400">Update your email address. You will be logged out of all sessions.</p>
                  <ChangeEmailForm />
                </div>
              )}

              {activeTab === 'sessions' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="sessions-tab">
                  <h2 className="text-xl font-semibold text-white flex items-center justify-between">
                    Active Sessions
                    <span className="text-sm text-gray-400 font-normal">Manage where you're logged in</span>
                  </h2>
                  <SessionsList onRevoke={handleRevokeSession} revokingId={revokingSession} />
                </div>
              )}

              {activeTab === 'danger' && (
                <div className="space-y-6" role="tabpanel" aria-labelledby="danger-tab">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <FiTrash2 size={22} className="text-red-400" aria-hidden="true" />
                    Danger Zone
                  </h2>
                  <p className="text-gray-400">Irreversible actions. Please proceed with caution.</p>

                  <div className="bg-gray-800/50 border border-red-900/50 rounded-xl p-6">
                    <h3 className="text-lg font-medium text-red-300 mb-3 flex items-center gap-2">
                      <FiTrash2 size={20} aria-hidden="true" />
                      Delete Account
                    </h3>
                    <p className="text-gray-400 mb-4">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <FiTrash2 size={22} className="text-red-400" aria-hidden="true" />
                Delete Account
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
        <div className="p-6 text-center text-gray-400">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="p-6 text-center text-gray-400">No active sessions</div>
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
                    {session.id === revokingId ? 'Current Session' : 'Active Session'}
                  </p>
                  <p className="text-sm text-gray-400">
                    Started {new Date(session.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {session.id !== revokingId && (
                <button
                  onClick={() => onRevoke(session.id)}
                  disabled={revokingId === session.id}
                  className="text-red-400 hover:text-red-300 text-sm font-medium disabled:opacity-50"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}