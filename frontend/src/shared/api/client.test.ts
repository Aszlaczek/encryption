import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, resetCsrfToken } from './client';
import { ApiError } from './types';
import { clearCsrfCookie, mockResponse, setCsrfCookie } from '../../test/http';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  resetCsrfToken();
  clearCsrfCookie();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetCsrfToken();
  clearCsrfCookie();
});

function lastRequest() {
  const [path, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { path, init, headers: init.headers as Record<string, string> };
}

describe('apiRequest', () => {
  it('sends GET without a CSRF header and with same-origin/no-store options', async () => {
    setCsrfCookie('cookie-token');
    fetchMock.mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }));

    await expect(apiRequest('/api/auth/me')).resolves.toEqual({ id: 'u1', username: 'alice' });

    const { path, init, headers } = lastRequest();
    expect(path).toBe('/api/auth/me');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(headers['X-XSRF-TOKEN']).toBeUndefined();
  });

  it('reads the CSRF token from the cookie for state-changing requests', async () => {
    setCsrfCookie('cookie-token');
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 204 }));

    await expect(apiRequest('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();

    const { init, headers } = lastRequest();
    expect(init.method).toBe('POST');
    expect(headers['X-XSRF-TOKEN']).toBe('cookie-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches a CSRF token when no cookie exists', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          body: { token: 'fresh-token', headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' },
        }),
      )
      .mockResolvedValueOnce(mockResponse({ body: { id: 'u1', username: 'alice' } }));

    await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { username: 'alice', password: 'AliceDemo123!' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const csrfCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(csrfCall[0]).toBe('/api/auth/csrf');
    const { init, headers } = lastRequest();
    expect(headers['X-XSRF-TOKEN']).toBe('fresh-token');
    expect(init.body).toBe(JSON.stringify({ username: 'alice', password: 'AliceDemo123!' }));
  });

  it('parses RFC 9457 problems, field errors and Retry-After', async () => {
    setCsrfCookie('cookie-token');
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 429,
        headers: { 'Retry-After': '12' },
        body: {
          type: 'about:blank',
          title: 'Too Many Requests',
          status: 429,
          code: 'RATE_LIMITED',
          detail: 'Zbyt wiele prób.',
          instance: '/api/auth/login',
          traceId: 'trace-1',
          errors: [{ field: 'username', code: 'REQUIRED', message: 'Pole jest wymagane.' }],
        },
      }),
    );

    const error = await apiRequest('/api/auth/login', { method: 'POST' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      detail: 'Zbyt wiele prób.',
      retryAfterSeconds: 12,
      fieldErrors: [{ field: 'username', code: 'REQUIRED', message: 'Pole jest wymagane.' }],
    });
  });

  it('falls back to a generic ApiError when the error body is not JSON', async () => {
    setCsrfCookie('cookie-token');
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: { get: () => null },
      text: async () => '<html>bad gateway</html>',
    } as unknown as Response);

    await expect(apiRequest('/api/auth/me')).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN_ERROR',
      detail: 'Wystąpił błąd.',
    });
  });

  it('refreshes the CSRF token and retries once after CSRF_INVALID', async () => {
    setCsrfCookie('stale-token');
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({ status: 403, body: { status: 403, code: 'CSRF_INVALID', detail: 'Brak.' } }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          body: { token: 'new-token', headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' },
        }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 204 }));

    await expect(apiRequest('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const csrfCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(csrfCall[0]).toBe('/api/auth/csrf');
    const { headers } = lastRequest();
    expect(headers['X-XSRF-TOKEN']).toBe('new-token');
  });

  it('does not retry more than once', async () => {
    setCsrfCookie('stale-token');
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({ status: 403, body: { status: 403, code: 'CSRF_INVALID', detail: 'Brak.' } }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          body: { token: 'new-token', headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({ status: 403, body: { status: 403, code: 'CSRF_INVALID', detail: 'Brak.' } }),
      );

    await expect(apiRequest('/api/auth/logout', { method: 'POST' })).rejects.toMatchObject({
      status: 403,
      code: 'CSRF_INVALID',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns undefined for 204 responses', async () => {
    setCsrfCookie('cookie-token');
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 204 }));

    await expect(apiRequest('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
