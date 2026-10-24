import { useState, type FormEvent } from 'react';
import { InputField } from '../components/InputField';
import * as authApi from '../api/auth';

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword, confirmPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to change password';
      if (message.includes('incorrect')) {
        setError('Current password is incorrect');
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
          Password changed successfully. Other sessions have been logged out.
        </div>
      )}

      <InputField
        id="currentPassword"
        label="Current Password"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="••••••••"
        required
        autoComplete="current-password"
        showToggle
        disabled={loading}
      />

      <InputField
        id="newPassword"
        label="New Password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="••••••••"
        required
        autoComplete="new-password"
        showToggle
        showStrength
        helperText="Must be at least 8 characters"
        disabled={loading}
      />

      <InputField
        id="confirmPassword"
        label="Confirm New Password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="••••••••"
        required
        autoComplete="new-password"
        showToggle
        disabled={loading}
      />

      <button
        type="submit"
        disabled={loading || !currentPassword || !newPassword || !confirmPassword}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
      >
        {loading ? 'Saving...' : 'Change Password'}
      </button>
    </form>
  );
}