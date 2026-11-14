import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api';
import { LoginForm } from './LoginForm';

const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }));

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    state: { status: 'anonymous' },
    login: loginMock,
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

beforeEach(() => {
  loginMock.mockReset();
});

describe('LoginForm', () => {
  it('associates labels, hints and inputs', () => {
    render(<LoginForm />);

    const username = screen.getByLabelText('Login');
    const password = screen.getByLabelText('Hasło');

    expect(username).toHaveAttribute('autocomplete', 'username');
    expect(username).toHaveAttribute('aria-describedby', 'login-username-hint');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('aria-describedby', 'login-password-hint');
    expect(screen.getByText('Login nie jest wrażliwy na wielkość liter.')).toBeInTheDocument();
    expect(screen.getByText('Hasło jest wrażliwe na wielkość liter i spacje.')).toBeInTheDocument();
  });

  it('blocks an empty submit and links field errors with aria attributes', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    const username = screen.getByLabelText('Login');
    const password = screen.getByLabelText('Hasło');
    expect(loginMock).not.toHaveBeenCalled();
    expect(username).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(username).toHaveAttribute(
      'aria-describedby',
      'login-username-hint login-username-error',
    );
    expect(password).toHaveAttribute(
      'aria-describedby',
      'login-password-hint login-password-error',
    );
    expect(screen.getByText('Podaj login.')).toHaveAttribute('id', 'login-username-error');
    expect(screen.getByText('Podaj hasło.')).toHaveAttribute('id', 'login-password-error');
    expect(username).toHaveFocus();
  });

  it('trims the username but never the password', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({ id: 'u1', username: 'alice' });
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Login'), '  alice  ');
    await user.type(screen.getByLabelText('Hasło'), ' pass with spaces ');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        username: 'alice',
        password: ' pass with spaces ',
      }),
    );
  });

  it('disables the form and announces progress while the request is pending', async () => {
    const user = userEvent.setup();
    let resolveLogin: ((user: { id: string; username: string }) => void) | undefined;
    loginMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Login'), 'alice');
    await user.type(screen.getByLabelText('Hasło'), 'AliceDemo123!');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    const button = screen.getByRole('button', { name: 'Logowanie…' });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('Login')).toBeDisabled();
    expect(screen.getByLabelText('Hasło')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Trwa logowanie…');

    resolveLogin?.({ id: 'u1', username: 'alice' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zaloguj się' })).toBeEnabled());
  });

  it('shows a generic message and clears the password after 401', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Nieprawidłowe dane logowania.'),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Login'), 'alice');
    await user.type(screen.getByLabelText('Hasło'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nieprawidłowy login lub hasło.');
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText('Hasło')).toHaveValue('');
    expect(screen.getByLabelText('Login')).toHaveValue('alice');
  });

  it('shows the Retry-After value for 429', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele prób.', { retryAfterSeconds: 12 }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Login'), 'alice');
    await user.type(screen.getByLabelText('Hasło'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Zbyt wiele prób logowania. Spróbuj ponownie za 12 s.',
    );
  });

  it('maps 400 field violations onto accessible field errors', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', 'Popraw dane.', {
        fieldErrors: [{ field: 'username', code: 'TOO_LONG', message: 'Maksymalnie 50 znaków.' }],
      }),
    );
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Login'), 'a'.repeat(51));
    await user.type(screen.getByLabelText('Hasło'), 'AliceDemo123!');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    const username = screen.getByLabelText('Login');
    await waitFor(() => expect(username).toHaveAttribute('aria-invalid', 'true'));
    expect(username).toHaveAttribute(
      'aria-describedby',
      'login-username-hint login-username-error',
    );
    expect(screen.getByText('Maksymalnie 50 znaków.')).toHaveAttribute(
      'id',
      'login-username-error',
    );
    expect(username).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a network message when the request fails without an ApiError', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Login'), 'alice');
    await user.type(screen.getByLabelText('Hasło'), 'AliceDemo123!');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.',
    );
  });

  it('restores the button and keeps both fields after a network failure', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<LoginForm />);

    await user.type(screen.getByLabelText('Login'), 'alice');
    await user.type(screen.getByLabelText('Hasło'), 'AliceDemo123!');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));
    await screen.findByRole('alert');

    expect(screen.getByRole('button', { name: 'Zaloguj się' })).toBeEnabled();
    expect(screen.getByLabelText('Login')).toHaveValue('alice');
    expect(screen.getByLabelText('Hasło')).toHaveValue('AliceDemo123!');
    expect(screen.getByLabelText('Hasło')).not.toHaveAttribute('aria-invalid');
  });
});
