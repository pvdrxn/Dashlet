import { useState, type ChangeEvent } from 'react';

interface InputFieldProps {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'number';
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  showToggle?: boolean;
  showStrength?: boolean;
  helperText?: string;
}

export function InputField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  disabled,
  required,
  autoComplete,
  autoFocus,
  showToggle,
  showStrength,
  helperText,
}: InputFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputType = showToggle && (type === 'password') ? (showPassword ? 'text' : 'password') : type;

  const getPasswordStrength = (pwd: string): { score: number; label: string; color: string; bgColor: string } => {
    if (!pwd) return { score: 0, label: '', color: '', bgColor: '' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
    const colors = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-lime-400', 'text-green-400'];
    const bgColors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-lime-400', 'bg-green-400'];
    return { score, label: labels[score - 1] || '', color: colors[score - 1] || '', bgColor: bgColors[score - 1] || '' };
  };

  const strength = showStrength ? getPasswordStrength(value) : null;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-gray-300">
        {label}
        {required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={`
            w-full px-3 py-2.5 bg-gray-800 border rounded-lg text-white placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-p2 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors
            ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 hover:border-gray-600'}
            ${showToggle ? 'pr-10' : ''}
          `}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        />
        {showToggle && type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        )}
        {error && (
          <p id={`${id}-error`} className="mt-1.5 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
      {strength && strength.score > 0 && (
        <div className="space-y-1" aria-live="polite">
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={strength.score * 20} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full transition-all duration-300 ${strength.bgColor}`}
              style={{ width: `${strength.score * 20}%` }}
            />
          </div>
          <p className={`text-xs ${strength.color}`}>{strength.label}</p>
        </div>
      )}
      {helperText && !error && (
        <p id={`${id}-helper`} className="text-xs text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  );
}