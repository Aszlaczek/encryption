import type { ReactNode } from 'react';

type FormFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};
export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  return (
    <div className={`form-field${error ? ' form-field--invalid' : ''}`}>
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="form-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="form-field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
