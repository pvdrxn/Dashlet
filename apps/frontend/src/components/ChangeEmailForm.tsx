import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { InputField } from '../components/InputField';
import * as authApi from '../api/auth';

export function ChangeEmailForm() {
  const { user, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!currentPassword || !newEmail) {
      setError('All fields are required');
      return;
    }

    if (newEmail === user?.email) {
      setError('New email must be different from current email');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setError('Enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await authApi.changeEmail({ currentPassword, newEmail });
      setSuccess(true);
      setCurrentPassword('');
      setNewEmail('');
      await refreshUser();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to change email';
      if (message.includes('incorrect')) {
        setError('Current password is incorrect');
      } else if (message.includes('already')) {
        setError('This email is already registered');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg p-3" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-green-400 bg-green-900/30 border border-green-800 rounded-lg p-3" role="alert">
          Email changed successfully. You have been logged out of all sessions.
        </div>
      )}

      <div>
        <label className="block text-sm text-gray-300 mb-1">Current Email</label>
        <input
          type="email"
          value={user?.email || ''}
          readOnly
          className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
        />
      </div>

      <InputField
        id="newEmail"
        label="New Email"
        type="email"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        placeholder="new@example.com"
        required
        autoComplete="email"
        disabled={loading}
      />

      <InputField
        id="currentPasswordEmail"
        label="Current Password"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="••••••••"
        required
        autoComplete="current-password"
        showToggle
        helperText="Required to confirm email change"
        disabled={loading}
      />

      <button
        type="submit"
        disabled={loading || !currentPassword || !newEmail}
        className="w-full py-2.5 bg-p2 hover:bg-p2-oscura disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-semibold rounded-lg transition-colors"
      >
        {loading ? 'Saving...' : 'Change Email'}
      </button>
    </form>
  );
}