import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiCheckCircle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useTemporaryError } from '../hooks/useTemporaryError';
import { InputField } from '../components/InputField';
import { LanguagePickerDropdown } from '../components/LanguagePickerDropdown';

const PASSWORD_REQUIREMENTS = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function RegisterView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { register, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usernameErrorKey, setUsernameError] = useTemporaryError(4000);
  const [emailErrorKey, setEmailError] = useTemporaryError(4000);
  const [passwordErrorKey, setPasswordError] = useTemporaryError(4000);
  const [confirmErrorKey, setConfirmError] = useTemporaryError(4000);
  const [formError, setFormError] = useState('');

  const getUsernameError = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'auth.validation.usernameRequired';
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
      return 'auth.validation.usernameInvalid';
    }
    return null;
  };

  const getEmailError = (value: string): string | null => {
    if (!value) return 'auth.validation.emailRequired';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'auth.validation.emailInvalid';
    return null;
  };

  const getPasswordError = (value: string): string | null => {
    if (!value) return 'auth.validation.passwordRequired';
    if (value.length < 8) return 'auth.validation.passwordMin8';
    return null;
  };

  const getConfirmError = (value: string, pwd = password): string | null => {
    if (!value) return 'auth.validation.confirmRequired';
    if (value !== pwd) return 'auth.validation.passwordsMismatch';
    return null;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    if (!value.trim()) {
      setUsernameError(null);
    } else {
      setUsernameError(getUsernameError(value));
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (!value) {
      setEmailError(null);
    } else {
      setEmailError(getEmailError(value));
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (!value) {
      setPasswordError(null);
    } else {
      setPasswordError(getPasswordError(value));
    }
    if (confirmPassword) {
      setConfirmError(getConfirmError(confirmPassword, value));
    }
  };

  const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConfirmPassword(value);
    if (!value) {
      setConfirmError(null);
    } else {
      setConfirmError(getConfirmError(value));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const uErr = getUsernameError(username);
    const eErr = getEmailError(email);
    const pErr = getPasswordError(password);
    const cErr = getConfirmError(confirmPassword);

    if (uErr) setUsernameError(uErr);
    if (eErr) setEmailError(eErr);
    if (pErr) setPasswordError(pErr);
    if (cErr) setConfirmError(cErr);

    if (uErr || eErr || pErr || cErr) return;

    try {
      await register({ email, username: username.trim(), password });
      navigate('/');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Registration failed';
      if (message.includes('Username already')) {
        setFormError('This username is already taken');
      } else if (message.includes('Username must be')) {
        setFormError(t('auth.validation.usernameInvalid'));
      } else if (message.includes('already')) {
        setFormError('An account with this email already exists');
      } else {
        setFormError(message);
      }
    }
  };

  const handleUsernameBlur = () => {
    if (username.trim()) setUsernameError(getUsernameError(username));
  };
  const handleEmailBlur = () => {
    if (email) setEmailError(getEmailError(email));
  };
  const handlePasswordBlur = () => {
    if (password) setPasswordError(getPasswordError(password));
  };
  const handleConfirmBlur = () => {
    if (confirmPassword) setConfirmError(getConfirmError(confirmPassword));
  };

  return (
    <div className="relative min-h-full h-full w-full bg-gray-950 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguagePickerDropdown />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white tracking-tight">Dashlet</h1>
          <p className="text-gray-400 mt-2">{t('auth.createAccountDesc', 'Create your account to get started.')}</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {formError && (
              <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg p-3 flex items-center gap-2" role="alert">
                <span className="flex-shrink-0">⚠</span>
                {formError}
              </div>
            )}

            <InputField
              id="username"
              label={t('auth.usernameLabel', 'Username')}
              value={username}
              onChange={handleUsernameChange}
              onBlur={handleUsernameBlur}
              error={usernameErrorKey ? t(usernameErrorKey) : undefined}
              placeholder={t('auth.usernamePlaceholder', 'your_username')}
              required
              autoComplete="username"
              autoFocus
              helperText={t('auth.usernameHelper', '3-20 characters. Letters, numbers, and underscores only.')}
            />

            <InputField
              id="email"
              label={t('auth.emailLabel', 'Email')}
              type="email"
              value={email}
              onChange={handleEmailChange}
              onBlur={handleEmailBlur}
              error={emailErrorKey ? t(emailErrorKey) : undefined}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />

            <InputField
              id="password"
              label={t('auth.passwordLabel', 'Password')}
              type="password"
              value={password}
              onChange={handlePasswordChange}
              onBlur={handlePasswordBlur}
              error={passwordErrorKey ? t(passwordErrorKey) : undefined}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              showToggle
            />

            {/* Password requirements checklist */}
            {password && (
              <div className="space-y-1.5 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg">
                <p className="text-xs text-gray-400 font-medium mb-1">Password must contain:</p>
                {PASSWORD_REQUIREMENTS.map((req) => {
                  const met = req.test(password);
                  return (
                    <div
                      key={req.label}
                      className={`flex items-center gap-2 text-xs transition-colors ${
                        met ? 'text-green-400' : 'text-gray-500'
                      }`}
                    >
                      <FiCheckCircle size={14} className={met ? 'text-green-400' : 'text-gray-600'} />
                      <span>{req.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <InputField
              id="confirmPassword"
              label={t('auth.confirmPasswordLabel', 'Confirm Password')}
              type="password"
              value={confirmPassword}
              onChange={handleConfirmChange}
              onBlur={handleConfirmBlur}
              error={confirmErrorKey ? t(confirmErrorKey) : undefined}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              showToggle
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-p2 hover:bg-p2-oscura disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-semibold font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('auth.creatingAccount', 'Creating account...')}
                </>
              ) : (
                <>
                  {t('auth.createAccountButton', 'Create Account')}
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
                <span className="px-4 bg-gray-900/80 text-gray-500">{t('auth.orContinueWith', 'Or continue with')}</span>
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
          {t('auth.hasAccount', 'Already have an account?')}{' '}
          <a href="/login" className="text-p2 hover:text-p2/80 font-medium underline">
            {t('auth.logIn', 'Sign in')}
          </a>
        </p>
      </div>
    </div>
  );
}
