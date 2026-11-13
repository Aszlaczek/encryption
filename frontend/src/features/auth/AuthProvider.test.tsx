import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { resetCsrfToken } from '../../shared/api';
import { clearCsrfCookie, mockResponse, setCsrfCookie } from '../../test/http';

const fetchMock = vi.fn();

function unauthenticated() {
  return mockResponse({
    status: 401,
    body: { status: 401, code: 'UNAUTHENTICATED', detail: 'Wymagane logowanie.' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  resetCsrfToken();
  setCsrfCookie('csrf-token');
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetCsrfToken();
  clearCsrfCookie();
  localStorage.clear();
  sessionStorage.clear();
});

describe('AuthProvider session flow', () => {
  it('renders the authenticated shell when /me returns the current user', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }));

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Zalogowano' })).toBeInTheDocument();
    expect(screen.getByText('alice', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wyloguj się' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/me');
  });

  it('treats 401 from /me as anonymous without an error alert', async () => {
    fetchMock.mockResolvedValueOnce(unauthenticated());

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a retry when the session check fails', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          status: 500,
          body: { status: 500, code: 'INTERNAL_ERROR', detail: 'Błąd serwera.' },
        }),
      )
      .mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }));

    render(<App />);

    expect(await screen.findByText('Nie udało się sprawdzić sesji')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się sprawdzić sesji');
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));

    expect(await screen.findByRole('heading', { name: 'Zalogowano' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/me');
  });

  it('logs in against the backend and never sends an owner id or writes storage', async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    fetchMock
      .mockResolvedValueOnce(unauthenticated())
      .mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }));

    render(<App />);

    await screen.findByRole('heading', { name: 'Zaloguj się' });
    await user.type(screen.getByLabelText('Login'), '  alice  ');
    await user.type(screen.getByLabelText('Hasło'), 'AliceDemo123!');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    expect(await screen.findByRole('heading', { name: 'Zalogowano' })).toBeInTheDocument();

    const [path, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(path).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-token');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ username: 'alice', password: 'AliceDemo123!' });
    expect(body).not.toHaveProperty('ownerId');

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.stringify(localStorage)).not.toContain('AliceDemo123!');
    expect(document.cookie).not.toContain('AliceDemo123!');
  });

  it('logs out, returns to the login form and keeps storage empty', async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    fetchMock
      .mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }))
      .mockResolvedValueOnce(mockResponse({ status: 204 }));

    render(<App />);

    await screen.findByRole('heading', { name: 'Zalogowano' });
    await user.click(screen.getByRole('button', { name: 'Wyloguj się' }));

    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    const [path, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(path).toBe('/api/auth/logout');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('csrf-token');
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('treats a 401 during logout as already logged out', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }))
      .mockResolvedValueOnce(unauthenticated());

    render(<App />);

    await screen.findByRole('heading', { name: 'Zalogowano' });
    await user.click(screen.getByRole('button', { name: 'Wyloguj się' }));

    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
  });

  it('ends the session and explains why when a protected request returns 401', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }))
      .mockResolvedValueOnce(unauthenticated());

    render(<App />);

    await screen.findByRole('heading', { name: 'Szyfrowanie i deszyfrowanie' });
    fireEvent.change(screen.getByLabelText('Pakiet do odszyfrowania'), {
      target: { value: 'v1.k1.nonce.cipher.tag' },
    });
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(screen.getByText('Sesja wygasła. Zaloguj się ponownie.')).toBeInTheDocument();
    const [path, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(path).toBe('/api/crypto/decrypt');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ package: 'v1.k1.nonce.cipher.tag' });
  });

  it('keeps the session and shows an alert when logout fails', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 500,
          body: { status: 500, code: 'INTERNAL_ERROR', detail: 'Błąd serwera.' },
        }),
      );

    render(<App />);

    await screen.findByRole('heading', { name: 'Zalogowano' });
    await user.click(screen.getByRole('button', { name: 'Wyloguj się' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się wylogować. Spróbuj ponownie.',
    );
    expect(screen.getByRole('heading', { name: 'Zalogowano' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Wyloguj się' })).toBeEnabled());
  });
});
