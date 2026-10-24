import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';
import { useAuth } from '../hooks/useAuth';
import { InputField } from '../components/InputField';

export function LoginView() {
  const navigate = useNavigate();
  const { login, loading, error: authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');

  const validateEmail = (value: string): string => {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
    return '';
  };

  const validatePassword = (value: string): string => {
    if (!value) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return '';
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setEmailError(validateEmail(value));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setPasswordError(validatePassword(value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setFormError('');

    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);

    if (emailErr) setEmailError(emailErr);
    if (passwordErr) setPasswordError(passwordErr);
    if (emailErr || passwordErr) return;

    try {
      await login({ email, password });
      navigate('/');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Login failed';
      if (message.includes('credentials') || message.includes('Invalid')) {
        setFormError('Invalid email or password');
      } else {
        setFormError(message);
      }
    }
  };

  const handleEmailBlur = () => setEmailError(validateEmail(email));
  const handlePasswordBlur = () => setPasswordError(validatePassword(password));

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white tracking-tight">Dashlet</h1>
          <p className="text-gray-400 mt-2">Welcome back. Sign in to continue.</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {formError && (
              <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg p-3 flex items-center gap-2" role="alert">
                <span className="flex-shrink-0">⚠</span>
                {formError}
              </div>
            )}

            {authError && (
              <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg p-3 flex items-center gap-2" role="alert">
                <span className="flex-shrink-0">⚠</span>
                {authError}
              </div>
            )}

            <InputField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              onBlur={handleEmailBlur}
              error={emailError}
              placeholder="you@example.com"
              required
              autoComplete="email"
              autoFocus
            />

            <InputField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              onBlur={handlePasswordBlur}
              error={passwordError}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              showToggle
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-300">Remember me</span>
              </label>
              <a
                href="#"
                className="text-sm text-blue-400 hover:text-blue-300 underline font-medium"
              >
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <FiArrowRight size={18} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-800" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-gray-900/80 text-gray-500">Or continue with</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <button
                type="button"
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don&apos;t have an account?{' '}
          <a href="/register" className="text-blue-400 hover:text-blue-300 font-medium underline">
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}