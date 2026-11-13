import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '../shared/api';
import { clearCsrfCookie, mockResponse, setCsrfCookie } from '../test/http';
import { App } from './App';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    mockResponse({
      status: 401,
      body: { status: 401, code: 'UNAUTHENTICATED', detail: 'Wymagane logowanie.' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  resetCsrfToken();
  setCsrfCookie('csrf-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetCsrfToken();
  clearCsrfCookie();
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
});
