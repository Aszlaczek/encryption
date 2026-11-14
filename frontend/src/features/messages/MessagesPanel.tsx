import { useEffect, useRef, useState } from 'react';
import { listMessages, type MessagePage, type MessageSummary } from './api';
import { describeMessageError } from './errors';
import { MessageListItem } from './MessageListItem';

type MessagesPanelProps = {
  onSessionExpired?: () => void;
};

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      items: MessageSummary[];
      nextCursor: string | null;
      hasMore: boolean;
    };

type LoadMoreState =
  { status: 'idle' } | { status: 'pending' } | { status: 'error'; message: string };

const CURSOR_MESSAGE = 'Nie udało się pobrać kolejnej strony. Odśwież listę i spróbuj ponownie.';
const ALREADY_GONE_MESSAGE = 'Wiadomość była już usunięta.';

function mergeItems(existing: MessageSummary[], incoming: MessageSummary[]): MessageSummary[] {
  const seen = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !seen.has(item.id))];
}

/** A page that claims more data without a cursor would loop forever; treat it as an error. */
function paginationProblem(page: MessagePage): string | null {
  return page.hasMore && !page.nextCursor ? CURSOR_MESSAGE : null;
}

/**
 * Cursor-paginated list of the session owner's messages. The cursor advances only after a
 * successful response, so a failed page is retried with the same cursor instead of skipped.
 * Deleting an item keeps the cursor untouched; when the last visible item disappears and the
 * server still reports more data, the next page is loaded with that same cursor.
 */
export function MessagesPanel({ onSessionExpired }: MessagesPanelProps) {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [loadMore, setLoadMore] = useState<LoadMoreState>({ status: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadMoreAlertRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocusIdRef = useRef<string | null | undefined>(undefined);
  const onSessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listMessages({ signal: controller.signal })
      .then((page) => {
        if (!active) {
          return;
        }
        const problem = paginationProblem(page);
        if (problem) {
          setState({ status: 'error', message: problem });
          return;
        }
        setState({
          status: 'ready',
          items: page.items,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        const failure = describeMessageError(error);
        if (failure.kind === 'session') {
          onSessionExpiredRef.current?.();
          return;
        }
        setState({ status: 'error', message: failure.message });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  useEffect(() => {
    if (loadMore.status === 'error') {
      loadMoreAlertRef.current?.focus();
    }
  }, [loadMore]);

  /**
   * Deleting the focused row removes its buttons from the DOM. Move focus to the next row's
   * delete action, or to the list heading when no row is left, instead of dropping it to <body>.
   */
  useEffect(() => {
    const targetId = pendingFocusIdRef.current;
    if (targetId === undefined) {
      return;
    }
    pendingFocusIdRef.current = undefined;

    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [],
    );
    const targetItem =
      targetId === null ? undefined : items.find((item) => item.dataset.messageId === targetId);
    const target =
      targetItem?.querySelector<HTMLElement>('[data-message-action="delete"]') ??
      headingRef.current;
    target?.focus();
  }, [state]);

  function reload() {
    setLoadMore({ status: 'idle' });
    setNotice(null);
    setState({ status: 'loading' });
    setReloadKey((value) => value + 1);
  }

  async function loadNextPage(cursor: string | null) {
    if (loadMore.status === 'pending') {
      return;
    }
    if (!cursor) {
      setLoadMore({ status: 'error', message: CURSOR_MESSAGE });
      return;
    }

    setLoadMore({ status: 'pending' });
    try {
      const page = await listMessages({ cursor });
      const problem = paginationProblem(page);
      if (problem) {
        setLoadMore({ status: 'error', message: problem });
        return;
      }
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              items: mergeItems(current.items, page.items),
              nextCursor: page.nextCursor,
              hasMore: page.hasMore,
            }
          : current,
      );
      setLoadMore({ status: 'idle' });
    } catch (error) {
      const failure = describeMessageError(error);
      if (failure.kind === 'session') {
        onSessionExpiredRef.current?.();
        return;
      }
      setLoadMore({ status: 'error', message: failure.message });
    }
  }

  function handleLoadMore() {
    if (state.status !== 'ready' || !state.hasMore || loadMore.status === 'pending') {
      return;
    }
    void loadNextPage(state.nextCursor);
  }

  function handleDeleted(id: string, options?: { alreadyGone?: boolean }) {
    setNotice(options?.alreadyGone ? ALREADY_GONE_MESSAGE : null);
    if (state.status !== 'ready') {
      return;
    }

    const removedIndex = state.items.findIndex((item) => item.id === id);
    const items = state.items.filter((item) => item.id !== id);
    const nextFocus = items[removedIndex] ?? items[removedIndex - 1];
    pendingFocusIdRef.current = nextFocus ? nextFocus.id : null;
    setState({
      status: 'ready',
      items,
      nextCursor: state.nextCursor,
      hasMore: state.hasMore,
    });

    if (items.length === 0 && state.hasMore) {
      void loadNextPage(state.nextCursor);
    }
  }

  const busy = state.status === 'loading' || loadMore.status === 'pending';

  return (
    <section className="messages-panel" aria-labelledby="messages-heading">
      <div className="messages-panel__header">
        <h2
          id="messages-heading"
          className="messages-panel__heading"
          tabIndex={-1}
          ref={headingRef}
        >
          Zapisane wiadomości
        </h2>
        <button
          className="button button--secondary button--small"
          type="button"
          onClick={reload}
          disabled={busy}
        >
          Odśwież listę
        </button>
      </div>
      <p className="messages-panel__lead">
        Widzisz wyłącznie wiadomości zapisane na tym koncie. Pakiet i treść pobierane są dopiero po
        kliknięciu przycisku przy wybranej wiadomości.
      </p>

      {notice ? (
        <p className="messages-panel__notice" role="status">
          {notice}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <p className="session-status" role="status">
          Pobieranie wiadomości…
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div className="alert alert--error" role="alert">
          <p>{state.message}</p>
          <button className="button button--secondary button--small" type="button" onClick={reload}>
            Spróbuj ponownie
          </button>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          {state.items.length === 0 && !state.hasMore ? (
            <p className="messages-panel__empty">
              Nie masz jeszcze zapisanych wiadomości. Użyj sekcji „Szyfrowanie”, aby zapisać
              pierwszą.
            </p>
          ) : (
            <ul className="message-list" aria-busy={loadMore.status === 'pending'} ref={listRef}>
              {state.items.map((message) => (
                <MessageListItem
                  key={message.id}
                  message={message}
                  onSessionExpired={onSessionExpired}
                  onDeleted={handleDeleted}
                />
              ))}
            </ul>
          )}

          {loadMore.status === 'error' ? (
            <div className="alert alert--error" role="alert" tabIndex={-1} ref={loadMoreAlertRef}>
              <p>{loadMore.message}</p>
              <button
                className="button button--secondary button--small"
                type="button"
                onClick={handleLoadMore}
              >
                Spróbuj ponownie
              </button>
            </div>
          ) : null}

          {state.hasMore ? (
            <div className="messages-panel__footer">
              <button
                className="button button--secondary"
                type="button"
                onClick={handleLoadMore}
                disabled={loadMore.status === 'pending'}
                aria-busy={loadMore.status === 'pending'}
              >
                {loadMore.status === 'pending' ? 'Pobieranie…' : 'Pobierz więcej'}
              </button>
              <p className="visually-hidden" role="status">
                {loadMore.status === 'pending' ? 'Trwa pobieranie kolejnej strony…' : ''}
              </p>
            </div>
          ) : state.items.length > 0 ? (
            <p className="messages-panel__footer-note">To wszystkie zapisane wiadomości.</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
