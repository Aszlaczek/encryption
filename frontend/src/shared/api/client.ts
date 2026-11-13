import { ApiError, type ApiProblem } from './types';

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';
const CSRF_PATH = '/api/auth/csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type CsrfResponse = {
  token: string;
  headerName: string;
  cookieName: string;
};

export type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

let csrfToken: string | null = null;

/** Forgets the in-memory CSRF token. The browser cookie remains the source of truth. */
export function resetCsrfToken(): void {
  csrfToken = null;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const prefix = `${name}=`;
  for (const entry of document.cookie.split(';')) {
    const value = entry.trim();
    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }
  return null;
}

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch(CSRF_PATH, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  const payload = (await response.json()) as CsrfResponse;
  csrfToken = payload.token;
  return payload.token;
}

async function ensureCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    if (csrfToken) {
      return csrfToken;
    }
    const fromCookie = readCookie(CSRF_COOKIE_NAME);
    if (fromCookie) {
      csrfToken = fromCookie;
      return fromCookie;
    }
  }
  return fetchCsrfToken();
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
  const text = await response.text();
  let problem: ApiProblem | undefined;
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && 'code' in parsed) {
        problem = parsed as ApiProblem;
      }
    } catch {
      // Non-JSON error bodies (for example from a proxy) become a generic ApiError.
    }
  }
  return ApiError.fromProblem(response.status, problem, retryAfterSeconds);
}

async function execute<T>(
  path: string,
  options: RequestOptions,
  allowCsrfRetry: boolean,
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!SAFE_METHODS.has(method)) {
    headers[CSRF_HEADER_NAME] = await ensureCsrfToken();
  }

  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    const error = await toApiError(response);
    const csrfFailure =
      error.status === 403 && error.code === 'CSRF_INVALID' && !SAFE_METHODS.has(method);
    if (allowCsrfRetry && csrfFailure) {
      await ensureCsrfToken(true);
      return execute<T>(path, options, false);
    }
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Same-origin JSON client. Session cookies are sent by the browser; the CSRF token is read from
 * the `XSRF-TOKEN` cookie and attached only to state-changing requests.
 */
export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return execute<T>(path, options, true);
}
