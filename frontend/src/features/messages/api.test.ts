import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '../../shared/api';
import { clearCsrfCookie, mockResponse, setCsrfCookie } from '../../test/http';
import { decryptMessage, getMessage, listMessages } from './api';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  resetCsrfToken();
  setCsrfCookie('csrf-token');
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

describe('messages api', () => {
  it('lists the first page with the documented limit and without CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ body: { items: [], nextCursor: null, hasMore: false } }),
    );

    await expect(listMessages()).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    const { path, init, headers } = lastRequest();
    expect(path).toBe('/api/messages?limit=10');
    expect(init.method).toBe('GET');
    expect(init.cache).toBe('no-store');
    expect(headers['X-XSRF-TOKEN']).toBeUndefined();
  });

  it('forwards an opaque cursor without reinterpreting it', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ body: { items: [], nextCursor: null, hasMore: false } }),
    );

    await listMessages({ cursor: 'abc:def' });

    expect(lastRequest().path).toBe('/api/messages?limit=10&cursor=abc%3Adef');
  });

  it('passes the abort signal so a stale list request can be cancelled', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ body: { items: [], nextCursor: null, hasMore: false } }),
    );
    const controller = new AbortController();

    await listMessages({ signal: controller.signal });

    expect(lastRequest().init.signal).toBe(controller.signal);
  });

  it('loads a single message package by id', async () => {
    const detail = {
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-11-13T10:15:00Z',
      package: 'v1.k1.n.c.t',
    };
    fetchMock.mockResolvedValueOnce(mockResponse({ body: detail }));

    await expect(getMessage(detail.id)).resolves.toEqual(detail);

    const { path, init } = lastRequest();
    expect(path).toBe(`/api/messages/${detail.id}`);
    expect(init.method).toBe('GET');
  });

  it('decrypts one message with POST, no body and a CSRF header', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    fetchMock.mockResolvedValueOnce(mockResponse({ body: { plaintext: 'treść' } }));

    await expect(decryptMessage(id)).resolves.toEqual({ plaintext: 'treść' });

    const { path, init, headers } = lastRequest();
    expect(path).toBe(`/api/messages/${id}/decrypt`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers['X-XSRF-TOKEN']).toBe('csrf-token');
  });

  it('never sends an owner identifier in the path or query', async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({ body: { items: [], nextCursor: null, hasMore: false } }),
      )
      .mockResolvedValueOnce(
        mockResponse({ body: { id: 'm1', createdAt: '2026-11-13T10:15:00Z', package: 'v1.a' } }),
      )
      .mockResolvedValueOnce(mockResponse({ body: { plaintext: 'x' } }));

    await listMessages();
    await getMessage('m1');
    await decryptMessage('m1');

    for (const [path, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(path).not.toContain('owner');
      expect(init.body).toBeUndefined();
    }
  });
});
