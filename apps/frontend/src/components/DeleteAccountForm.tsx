import { useState, type FormEvent } from 'react';
import { FiAlertTriangle, FiTrash2 } from 'react-icons/fi';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { InputField } from '../components/InputField';
import * as authApi from '../api/auth';

export function DeleteAccountForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'confirm' | 'deleting' | 'done'>('confirm');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (step === 'confirm') {
      if (confirmText !== 'DELETE') {
        setError('Please type DELETE to confirm');
        return;
      }
      setStep('deleting');
    } else if (step === 'deleting') {
      if (!password) {
        setError('Password is required');
        setStep('confirm');
        return;
      }

      setLoading(true);
      try {
        await authApi.deleteAccount(password);
        await logout();
        setStep('done');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to delete account';
        if (message.includes('incorrect')) {
          setError('Password is incorrect');
        } else {
          setError(message);
        }
        setStep('confirm');
      } finally {
        setLoading(false);
      }
    }
  };

  if (step === 'done') {
    return (
      <div className="text-center py-8">
        <div className="mx-auto w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center mb-4">
          <FiTrash2 size={32} className="text-green-400" aria-hidden="true" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Account Deleted</h3>
        <p className="text-gray-400 mb-6">Your account has been permanently deleted.</p>
        <button
          onClick={() => navigate('/register')}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
        >
          Create New Account
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {step === 'confirm' && (
        <div className="p-4 bg-amber-900/30 border border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <FiAlertTriangle size={24} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-amber-300">
              <p className="font-medium mb-1">This action is irreversible</p>
              <p>Deleting your account will permanently remove:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All your tabs, widgets, and their data</li>
                <li>Calendar events and tags</li>
                <li>Data tables and rows</li>
                <li>All sessions and login history</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg p-3" role="alert">
          {error}
        </div>
      )}

      {step === 'confirm' ? (
        <div>
          <label className="block text-sm text-gray-300 mb-2">
            Type <code className="bg-gray-800 px-1.5 py-0.5 rounded text-red-400 font-mono">DELETE</code> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            autoComplete="off"
          />
        </div>
      ) : (
        <InputField
          id="deletePassword"
          label="Enter your password to confirm deletion"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
          showToggle
          disabled={loading}
        />
      )}

      <button
        type="submit"
        disabled={loading || (step === 'confirm' && confirmText !== 'DELETE') || (step === 'deleting' && !password)}
        className={`w-full py-2.5 font-medium rounded-lg transition-colors ${
          step === 'confirm'
            ? 'bg-amber-600 hover:bg-amber-500 text-white'
            : 'bg-red-600 hover:bg-red-500 text-white disabled:bg-red-900/50'
        }`}
      >
        {loading ? (
          'Deleting...'
        ) : step === 'confirm' ? (
          'I Understand - Continue'
        ) : (
          'Delete My Account Permanently'
        )}
      </button>

      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}