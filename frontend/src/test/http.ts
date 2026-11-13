type MockResponseInit = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};

/** Minimal `Response` double; jsdom does not ship the Fetch API response classes. */
export function mockResponse({
  status = 200,
  body,
  headers = {},
}: MockResponseInit = {}): Response {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => normalizedHeaders[name.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

export function clearCsrfCookie(): void {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

export function setCsrfCookie(token: string): void {
  document.cookie = `XSRF-TOKEN=${token}; path=/`;
}
