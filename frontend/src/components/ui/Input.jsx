import { useState } from 'react';
import { IconEye, IconEyeOff } from './Icons';

export default function Input({
  label,
  name,
  type = 'text',
  error,
  hint,
  required,
  icon: Icon,
  className = '',
  ...rest
}) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && reveal ? 'text' : type;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={name} className="field-label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        )}
        <input
          id={name}
          name={name}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? name + '-error' : undefined}
          className={[
            'field-input',
            Icon ? 'pl-10' : '',
            isPassword ? 'pr-10' : '',
            error ? 'field-input-error' : '',
          ].join(' ')}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setReveal((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={reveal ? 'Hide password' : 'Show password'}
          >
            {reveal ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={name + '-error'} className="field-error">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}
