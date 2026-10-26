import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiCheckCircle } from 'react-icons/fi';
import { useAuth } from '../hooks/useAuth';
import { InputField } from '../components/InputField';

const PASSWORD_REQUIREMENTS = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function RegisterView() {
  const navigate = useNavigate();
  const { register, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [formError, setFormError] = useState('');

  const validateUsername = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'Username is required';
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
      return 'Use 3-20 letters, numbers, or underscores';
    }
    return '';
  };

  const validateEmail = (value: string): string => {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
    return '';
  };

  const validatePassword = (value: string): string => {
    if (!value) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    return '';
  };

  const validateConfirm = (value: string): string => {
    if (!value) return 'Please confirm your password';
    if (value !== password) return 'Passwords do not match';
    return '';
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    setUsernameError(validateUsername(value));
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
    if (confirmPassword) setConfirmError(validateConfirm(value));
  };

  const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConfirmPassword(value);
    setConfirmError(validateConfirm(value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const usernameErr = validateUsername(username);
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    const confirmErr = validateConfirm(confirmPassword);

    if (usernameErr) setUsernameError(usernameErr);
    if (emailErr) setEmailError(emailErr);
    if (passwordErr) setPasswordError(passwordErr);
    if (confirmErr) setConfirmError(confirmErr);
    if (usernameErr || emailErr || passwordErr || confirmErr) return;

    try {
      await register({ email, username: username.trim(), password });
      navigate('/');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Registration failed';
      if (message.includes('Username already')) {
        setUsernameError('This username is already taken');
      } else if (message.includes('Username must be')) {
        setUsernameError('Use 3-20 letters, numbers, or underscores');
      } else if (message.includes('already')) {
        setEmailError('An account with this email already exists');
      } else {
        setFormError(message);
      }
    }
  };

  const handleUsernameBlur = () => setUsernameError(validateUsername(username));
  const handleEmailBlur = () => setEmailError(validateEmail(email));
  const handlePasswordBlur = () => setPasswordError(validatePassword(password));
  const handleConfirmBlur = () => setConfirmError(validateConfirm(confirmPassword));

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white tracking-tight">Dashlet</h1>
          <p className="text-gray-400 mt-2">Create your account to get started.</p>
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
              label="Username"
              value={username}
              onChange={handleUsernameChange}
              onBlur={handleUsernameBlur}
              error={usernameError}
              placeholder="your_username"
              required
              autoComplete="username"
              autoFocus
              helperText="3-20 characters. Letters, numbers, and underscores only."
            />

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
              autoComplete="new-password"
              showToggle
              showStrength
              helperText="Must be at least 8 characters"
            />

            {password && (
              <div className="space-y-1.5" role="list" aria-label="Password requirements">
                {PASSWORD_REQUIREMENTS.map((req, i) => {
                  const met = req.test(password);
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm" role="listitem">
                      <FiCheckCircle
                        size={14}
                        className={`flex-shrink-0 transition-colors ${met ? 'text-green-400' : 'text-gray-600'}`}
                        aria-hidden="true"
                      />
                      <span className={`${met ? 'text-gray-400' : 'text-gray-600'} transition-colors`}>
                        {req.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <InputField
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={handleConfirmChange}
              onBlur={handleConfirmBlur}
              error={confirmError}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              showToggle
            />

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                required
                className="mt-1 w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              />
              <label htmlFor="terms" className="text-sm text-gray-300">
                I agree to the{' '}
                <a href="#" className="text-blue-400 hover:text-blue-300 underline">Terms of Service</a>{' '}
                and{' '}
                <a href="#" className="text-blue-400 hover:text-blue-300 underline">Privacy Policy</a>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !username || !email || !password || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account...
                </>
              ) : (
                <>
                  Create Account
                  <FiArrowRight size={18} aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}