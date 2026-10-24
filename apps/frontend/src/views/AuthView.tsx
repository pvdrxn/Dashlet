import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AuthForm } from '../components/AuthForm';

export function AuthView() {
  const { login, register, loading, error, clearError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const handleSubmit = async (data: { email: string; password: string }) => {
    if (mode === 'login') {
      await login(data);
    } else {
      await register(data);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    clearError();
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Dashlet</h1>
          <p className="text-gray-400 mt-1">{mode === 'login' ? 'Welcome back' : 'Create your account'}</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-6 shadow-2xl backdrop-blur-sm">
          <AuthForm
            mode={mode}
            onSubmit={handleSubmit}
            loading={loading}
            error={error}
            onModeToggle={toggleMode}
          />
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}