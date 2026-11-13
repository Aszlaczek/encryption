import { apiRequest } from '../../shared/api';

/** Safe metadata returned by the list endpoint; it never contains the package. */
export type MessageSummary = {
  id: string;
  createdAt: string;
};

export type MessagePage = {
  items: MessageSummary[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type MessageDetail = {
  id: string;
  createdAt: string;
  package: string;
};

export type DecryptedMessage = {
  plaintext: string;
};

/** Matches the documented default page size; the backend caps it at 50. */
export const MESSAGE_PAGE_SIZE = 10;

type ListOptions = {
  cursor?: string | null;
  signal?: AbortSignal;
};

/**
 * Fetches one page of the session owner's messages. The cursor stays opaque and is only
 * forwarded; the client never derives paging from timestamps.
 */
export function listMessages({ cursor, signal }: ListOptions = {}): Promise<MessagePage> {
  const params = new URLSearchParams({ limit: String(MESSAGE_PAGE_SIZE) });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return apiRequest<MessagePage>(`/api/messages?${params.toString()}`, { signal });
}

/** Loads the package for a single message; used only after an explicit user action. */
export function getMessage(id: string, signal?: AbortSignal): Promise<MessageDetail> {
  return apiRequest<MessageDetail>(`/api/messages/${encodeURIComponent(id)}`, { signal });
}

/** Decrypts one saved message on demand; the endpoint takes no body. */
export function decryptMessage(id: string): Promise<DecryptedMessage> {
  return apiRequest<DecryptedMessage>(`/api/messages/${encodeURIComponent(id)}/decrypt`, {
    method: 'POST',
  });
}
