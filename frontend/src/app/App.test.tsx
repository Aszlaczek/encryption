import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '../shared/api';
import { createFetchRouter, emptyPage, type Routes } from '../test/backend';
import { clearCsrfCookie, mockResponse, setCsrfCookie } from '../test/http';
import { App } from './App';

const routes: Routes = {};
const fetchMock = createFetchRouter(routes);

function unauthenticated() {
  return mockResponse({
    status: 401,
    body: { status: 401, code: 'UNAUTHENTICATED', detail: 'Wymagane logowanie.' },
  });
}

function asAlice() {
  routes['/api/auth/me'] = () => mockResponse({ body: { id: 'u1', username: 'alice' } });
}

function callsTo(path: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).startsWith(path));
}

beforeEach(() => {
  for (const key of Object.keys(routes)) {
    delete routes[key];
  }
  fetchMock.mockClear();
  routes['/api/auth/me'] = unauthenticated;
  routes['/api/messages'] = emptyPage;
  vi.stubGlobal('fetch', fetchMock);
  resetCsrfToken();
  setCsrfCookie('csrf-token');
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetCsrfToken();
  clearCsrfCookie();
  localStorage.clear();
  sessionStorage.clear();
});

describe('App', () => {
  it('renders the project heading', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Szyfrowanie wiadomości');
    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
  });

  it('links to the project repository', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: /repozytorium projektu/i })).toHaveAttribute(
      'href',
      'https://github.com/Aszlaczek/encryption',
    );
  });

  it('exposes the main landmark and skip link', () => {
    render(<App />);

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: /przejdź do treści/i })).toHaveAttribute(
      'href',
      '#main-content',
    );
  });

  it('renders crypto and messages for an authenticated session', async () => {
    asAlice();

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Szyfrowanie i deszyfrowanie' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Treść wiadomości')).toBeInTheDocument();
    expect(screen.getByLabelText('Pakiet do odszyfrowania')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Zapisane wiadomości' })).toBeInTheDocument();
    expect(screen.getByText(/Nie masz jeszcze zapisanych wiadomości/)).toBeInTheDocument();

    const listCalls = callsTo('/api/messages');
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0][0]).toBe('/api/messages?limit=10');
    expect(String(listCalls[0][0])).not.toContain('owner');
  });

  it('clears decrypted content when the user logs out', async () => {
    const user = userEvent.setup();
    const messageId = '11111111-1111-4111-8111-111111111111';
    const secret = 'Treść tylko do testu wylogowania';
    asAlice();
    routes['/api/messages'] = () =>
      mockResponse({
        body: {
          items: [{ id: messageId, createdAt: '2026-11-13T10:15:00Z' }],
          nextCursor: null,
          hasMore: false,
        },
      });
    routes[`/api/messages/${messageId}/decrypt`] = () =>
      mockResponse({ body: { plaintext: secret } });
    routes['/api/auth/logout'] = () => mockResponse({ status: 204 });

    render(<App />);

    await screen.findByText(messageId);
    await user.click(screen.getByRole('button', { name: /Odszyfruj wiadomość/ }));
    expect(await screen.findByText(secret)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Wyloguj się' }));

    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(screen.queryByText(messageId)).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
