import { vi } from 'vitest';
import { mockResponse } from './http';

export type RouteHandler = (init: RequestInit) => Response;
export type Routes = Record<string, RouteHandler>;

/** Empty page returned by `GET /api/messages` in tests that do not care about the list. */
export const emptyMessagesPage = { items: [], nextCursor: null, hasMore: false };

/**
 * URL-aware `fetch` double. Tests register handlers per pathname so adding a new request
 * (for example the message list after login) does not shift a `mockResolvedValueOnce` queue.
 */
export function createFetchRouter(routes: Routes) {
  return vi.fn(async (input: string, init: RequestInit = {}) => {
    const path = String(input).split('?')[0];
    const handler = routes[path];
    if (!handler) {
      throw new Error(`Nieoczekiwane żądanie w teście: ${String(input)}`);
    }
    return handler(init);
  });
}

export function emptyPage() {
  return mockResponse({ body: emptyMessagesPage });
}
