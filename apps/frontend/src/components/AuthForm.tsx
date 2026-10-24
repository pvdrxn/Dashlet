import { useState, type FormEvent, type ChangeEvent } from 'react';

interface AuthFormProps {
  mode: 'login' | 'register';
  onSubmit: (data: { email: string; password: string }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  onModeToggle: () => void;
}

export function AuthForm({ mode, onSubmit, loading, error, onModeToggle }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (mode === 'register' && password !== confirmPassword) return;
    await onSubmit({ email, password });
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value);
  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value);
  const handleConfirmChange = (e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value);

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded p-3" role="alert">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm text-gray-300 mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={handleEmailChange}
          disabled={loading}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          placeholder="you@example.com"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm text-gray-300 mb-1">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={handlePasswordChange}
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 pr-10"
            placeholder="••••••••"
            required
            minLength={6}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {mode === 'register' && (
        <div>
          <label htmlFor="confirmPassword" className="block text-sm text-gray-300 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={handleConfirmChange}
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            placeholder="••••••••"
            required
            minLength={6}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password || (mode === 'register' && password !== confirmPassword)}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
      >
        {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
      </button>

      <p className="text-center text-sm text-gray-400">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button
          type="button"
          onClick={onModeToggle}
          disabled={loading}
          className="text-blue-400 hover:text-blue-300 underline font-medium"
        >
          {mode === 'login' ? 'Sign Up' : 'Sign In'}
        </button>
      </p>
    </form>
  );
}