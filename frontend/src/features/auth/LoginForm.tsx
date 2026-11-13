import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../shared/api';
import { FormField, describedBy } from '../../shared/ui';
import { useAuth } from './useAuth';

type FieldErrors = {
  username?: string;
  password?: string;
};

const USERNAME_HINT = 'Login nie jest wrażliwy na wielkość liter.';
const PASSWORD_HINT = 'Hasło jest wrażliwe na wielkość liter i spacje.';

export function LoginForm() {
  const { login, sessionNotice } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (formError) {
      alertRef.current?.focus();
    }
  }, [formError]);

  useEffect(() => {
    if (fieldErrors.username) {
      usernameRef.current?.focus();
    } else if (fieldErrors.password) {
      passwordRef.current?.focus();
    }
  }, [fieldErrors]);

  function applyError(error: unknown) {
    if (!(error instanceof ApiError)) {
      setFormError('Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.');
      return;
    }
    if (error.status === 400 && error.fieldErrors.length > 0) {
      const mapped: FieldErrors = {};
      for (const violation of error.fieldErrors) {
        if (violation.field === 'username' || violation.field === 'password') {
          mapped[violation.field] = violation.message;
        }
      }
      if (mapped.username || mapped.password) {
        setFieldErrors(mapped);
        return;
      }
    }
    if (error.status === 400) {
      setFormError(error.detail || 'Popraw dane formularza.');
      return;
    }
    if (error.status === 401) {
      setPassword('');
      setFormError('Nieprawidłowy login lub hasło.');
      return;
    }
    if (error.status === 429) {
      setFormError(
        error.retryAfterSeconds === undefined
          ? 'Zbyt wiele prób logowania. Spróbuj ponownie później.'
          : `Zbyt wiele prób logowania. Spróbuj ponownie za ${error.retryAfterSeconds} s.`,
      );
      return;
    }
    if (error.status === 403) {
      setFormError(
        'Nie udało się odświeżyć zabezpieczenia formularza. Odśwież stronę i spróbuj ponownie.',
      );
      return;
    }
    setFormError('Wystąpił błąd serwera. Spróbuj ponownie.');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const nextErrors: FieldErrors = {};
    if (!username.trim()) {
      nextErrors.username = 'Podaj login.';
    }
    if (!password) {
      nextErrors.password = 'Podaj hasło.';
    }
    setFieldErrors(nextErrors);
    setFormError(null);
    if (nextErrors.username || nextErrors.password) {
      return;
    }

    setPending(true);
    try {
      await login({ username: username.trim(), password });
    } catch (error) {
      applyError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="login-heading">
      <h2 id="login-heading">Zaloguj się</h2>
      <p className="auth-card__lead">
        Użyj konta demonstracyjnego <strong>alice</strong> lub <strong>bob</strong>. Hasła znajdują
        się w dokumentacji projektu.
      </p>

      {sessionNotice ? (
        <div className="alert alert--info" role="status">
          {sessionNotice}
        </div>
      ) : null}

      {formError ? (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={alertRef}>
          {formError}
        </div>
      ) : null}

      <form className="login-form" onSubmit={handleSubmit} noValidate aria-busy={pending}>
        <FormField
          id="login-username"
          label="Login"
          hint={USERNAME_HINT}
          error={fieldErrors.username}
        >
          <input
            ref={usernameRef}
            className="form-field__input"
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            maxLength={50}
            required
            disabled={pending}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-invalid={fieldErrors.username ? true : undefined}
            aria-describedby={describedBy('login-username', USERNAME_HINT, fieldErrors.username)}
          />
        </FormField>

        <FormField
          id="login-password"
          label="Hasło"
          hint={PASSWORD_HINT}
          error={fieldErrors.password}
        >
          <input
            ref={passwordRef}
            className="form-field__input"
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={pending}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={describedBy('login-password', PASSWORD_HINT, fieldErrors.password)}
          />
        </FormField>

        <button className="button button--primary" type="submit" disabled={pending}>
          {pending ? 'Logowanie…' : 'Zaloguj się'}
        </button>
        <p className="visually-hidden" role="status">
          {pending ? 'Trwa logowanie…' : ''}
        </p>
      </form>
    </section>
  );
}
