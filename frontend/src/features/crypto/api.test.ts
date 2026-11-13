import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '../../shared/api';
import { clearCsrfCookie, mockResponse, setCsrfCookie } from '../../test/http';
import { decryptPackage, encryptPlaintext, saveMessage } from './api';

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

describe('crypto api', () => {
  it('encrypts without persisting and sends only the plaintext', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ body: { package: 'v1.k1.n.c.t' } }));

    await expect(encryptPlaintext('tajna treść')).resolves.toEqual({ package: 'v1.k1.n.c.t' });

    const { path, init, headers } = lastRequest();
    expect(path).toBe('/api/crypto/encrypt');
    expect(init.method).toBe('POST');
    expect(headers['X-XSRF-TOKEN']).toBe('csrf-token');
    expect(JSON.parse(init.body as string)).toEqual({ plaintext: 'tajna treść' });
  });

  it('decrypts by sending the package and parses the plaintext', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ body: { plaintext: 'odszyfrowane' } }));

    await expect(decryptPackage('v1.k1.n.c.t')).resolves.toEqual({ plaintext: 'odszyfrowane' });

    const { path, init } = lastRequest();
    expect(path).toBe('/api/crypto/decrypt');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ package: 'v1.k1.n.c.t' });
  });

  it('saves through /api/messages and parses the created resource', async () => {
    const created = {
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-11-13T10:15:00Z',
      package: 'v1.k1.n.c.t',
    };
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, body: created }));

    await expect(saveMessage('do zapisu')).resolves.toEqual(created);

    const { path, init } = lastRequest();
    expect(path).toBe('/api/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ plaintext: 'do zapisu' });
  });

  it('never sends an owner id in any request body', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ body: { package: 'v1.a' } }))
      .mockResolvedValueOnce(mockResponse({ body: { plaintext: 'x' } }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 201,
          body: { id: 'm1', createdAt: '2026-11-13T10:15:00Z', package: 'v1.b' },
        }),
      );

    await encryptPlaintext('a');
    await decryptPackage('v1.a');
    await saveMessage('b');

    for (const call of fetchMock.mock.calls) {
      const body = (call[1] as RequestInit).body as string;
      expect(body).not.toContain('ownerId');
      expect(body).not.toContain('owner');
    }
  });
});
