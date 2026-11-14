import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api';
import { MessagesPanel } from './MessagesPanel';

const { listMessagesMock, getMessageMock, decryptMessageMock, deleteMessageMock } = vi.hoisted(
  () => ({
    listMessagesMock: vi.fn(),
    getMessageMock: vi.fn(),
    decryptMessageMock: vi.fn(),
    deleteMessageMock: vi.fn(),
  }),
);

vi.mock('./api', () => ({
  listMessages: listMessagesMock,
  getMessage: getMessageMock,
  decryptMessage: decryptMessageMock,
  deleteMessage: deleteMessageMock,
}));

function summary(id: string) {
  return { id, createdAt: '2026-11-13T10:15:00Z' };
}

function page(
  items: Array<{ id: string; createdAt: string }>,
  { hasMore = false, nextCursor = null as string | null } = {},
) {
  return { items, nextCursor, hasMore };
}

beforeEach(() => {
  listMessagesMock.mockReset();
  getMessageMock.mockReset();
  decryptMessageMock.mockReset();
  deleteMessageMock.mockReset();
});

describe('MessagesPanel', () => {
  it('shows a loading status and then the empty state', async () => {
    listMessagesMock.mockResolvedValue(page([]));

    render(<MessagesPanel />);

    expect(screen.getByRole('status')).toHaveTextContent('Pobieranie wiadomości…');
    expect(await screen.findByText(/Nie masz jeszcze zapisanych wiadomości/)).toBeInTheDocument();
    expect(listMessagesMock).toHaveBeenCalledTimes(1);
    const options = listMessagesMock.mock.calls[0][0] as { cursor?: string; signal: AbortSignal };
    expect(options.cursor).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps action names distinct when items share a timestamp', async () => {
    listMessagesMock.mockResolvedValue(
      page([
        summary('11111111-1111-4111-8111-111111111111'),
        summary('22222222-2222-4222-8222-222222222222'),
      ]),
    );

    render(<MessagesPanel />);

    await screen.findByText('11111111-1111-4111-8111-111111111111');
    const packageButtons = screen.getAllByRole('button', { name: /Pokaż pakiet wiadomości/ });
    const names = packageButtons.map((button) => button.getAttribute('aria-label'));

    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it('renders only the returned items and never fetches their content', async () => {
    listMessagesMock.mockResolvedValue(page([summary('message-a'), summary('message-b')]));

    render(<MessagesPanel />);

    expect(await screen.findByText('message-a')).toBeInTheDocument();
    expect(screen.getByText('message-b')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(getMessageMock).not.toHaveBeenCalled();
    expect(decryptMessageMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Pobierz więcej' })).not.toBeInTheDocument();
    expect(screen.getByText('To wszystkie zapisane wiadomości.')).toBeInTheDocument();
  });

  it('appends the next page with the cursor from the previous response', async () => {
    const user = userEvent.setup();
    listMessagesMock
      .mockResolvedValueOnce(
        page([summary('message-a'), summary('message-b')], {
          hasMore: true,
          nextCursor: 'cursor-1',
        }),
      )
      .mockResolvedValueOnce(page([summary('message-c')]));

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    await user.click(screen.getByRole('button', { name: 'Pobierz więcej' }));

    expect(await screen.findByText('message-c')).toBeInTheDocument();
    expect(listMessagesMock).toHaveBeenNthCalledWith(2, { cursor: 'cursor-1' });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Pobierz więcej' })).not.toBeInTheDocument();
    expect(screen.getByText('To wszystkie zapisane wiadomości.')).toBeInTheDocument();
  });

  it('keeps loaded items on a page error and retries the same cursor', async () => {
    const user = userEvent.setup();
    listMessagesMock
      .mockResolvedValueOnce(
        page([summary('message-a')], { hasMore: true, nextCursor: 'cursor-1' }),
      )
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Błąd serwera.'))
      .mockResolvedValueOnce(page([summary('message-b')]));

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    await user.click(screen.getByRole('button', { name: 'Pobierz więcej' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Wystąpił błąd serwera. Spróbuj ponownie.');
    expect(alert).toHaveFocus();
    expect(screen.getByText('message-a')).toBeInTheDocument();
    expect(screen.queryByText('message-b')).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Spróbuj ponownie' }));

    expect(await screen.findByText('message-b')).toBeInTheDocument();
    expect(listMessagesMock).toHaveBeenNthCalledWith(3, { cursor: 'cursor-1' });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('offers a retry when the first page fails', async () => {
    const user = userEvent.setup();
    listMessagesMock
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Błąd serwera.'))
      .mockResolvedValueOnce(page([]));

    render(<MessagesPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wystąpił błąd serwera. Spróbuj ponownie.',
    );

    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));

    expect(await screen.findByText(/Nie masz jeszcze zapisanych wiadomości/)).toBeInTheDocument();
    expect(listMessagesMock).toHaveBeenCalledTimes(2);
  });

  it('ends the session when the first page returns 401', async () => {
    const onSessionExpired = vi.fn();
    listMessagesMock.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Brak sesji.'));

    render(<MessagesPanel onSessionExpired={onSessionExpired} />);

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ends the session when loading another page returns 401', async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();
    listMessagesMock
      .mockResolvedValueOnce(
        page([summary('message-a')], { hasMore: true, nextCursor: 'cursor-1' }),
      )
      .mockRejectedValueOnce(new ApiError(401, 'UNAUTHENTICATED', 'Brak sesji.'));

    render(<MessagesPanel onSessionExpired={onSessionExpired} />);

    await screen.findByText('message-a');
    await user.click(screen.getByRole('button', { name: 'Pobierz więcej' }));

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the Retry-After value when another page is rate limited', async () => {
    const user = userEvent.setup();
    listMessagesMock
      .mockResolvedValueOnce(
        page([summary('message-a')], { hasMore: true, nextCursor: 'cursor-1' }),
      )
      .mockRejectedValueOnce(
        new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele.', { retryAfterSeconds: 12 }),
      );

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    await user.click(screen.getByRole('button', { name: 'Pobierz więcej' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Zbyt wiele operacji. Spróbuj ponownie za 12 s.',
    );
  });

  it('refuses a page that claims more data without a cursor', async () => {
    listMessagesMock.mockResolvedValue({
      items: [summary('message-a')],
      nextCursor: null,
      hasMore: true,
    });

    render(<MessagesPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się pobrać kolejnej strony. Odśwież listę i spróbuj ponownie.',
    );
    expect(screen.queryByRole('button', { name: 'Pobierz więcej' })).not.toBeInTheDocument();
    expect(listMessagesMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates ids repeated across pages', async () => {
    const user = userEvent.setup();
    listMessagesMock
      .mockResolvedValueOnce(
        page([summary('message-a'), summary('message-b')], {
          hasMore: true,
          nextCursor: 'cursor-1',
        }),
      )
      .mockResolvedValueOnce(page([summary('message-b'), summary('message-c')]));

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    await user.click(screen.getByRole('button', { name: 'Pobierz więcej' }));
    await screen.findByText('message-c');

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByText('message-b')).toHaveLength(1);
  });

  it('reloads the first page from the refresh button', async () => {
    const user = userEvent.setup();
    listMessagesMock
      .mockResolvedValueOnce(page([summary('message-a')]))
      .mockResolvedValueOnce(page([summary('message-a'), summary('message-b')]));

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    await user.click(screen.getByRole('button', { name: 'Odśwież listę' }));

    expect(await screen.findByText('message-b')).toBeInTheDocument();
    expect(listMessagesMock).toHaveBeenCalledTimes(2);
    const options = listMessagesMock.mock.calls[1][0] as { cursor?: string };
    expect(options.cursor).toBeUndefined();
  });

  it('removes only the deleted item and keeps the current cursor', async () => {
    const user = userEvent.setup();
    listMessagesMock.mockResolvedValueOnce(page([summary('message-a'), summary('message-b')]));
    deleteMessageMock.mockResolvedValue(undefined);

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    const first = screen.getAllByRole('listitem')[0];
    await user.click(within(first).getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(within(first).getByRole('button', { name: 'Tak, usuń' }));

    await waitFor(() => expect(screen.queryByText('message-a')).not.toBeInTheDocument());
    expect(deleteMessageMock).toHaveBeenCalledWith('message-a');
    expect(screen.getByText('message-b')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(listMessagesMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('To wszystkie zapisane wiadomości.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Usuń wiadomość/ })).toHaveFocus();
  });

  it('moves focus to the list heading after deleting the last row', async () => {
    const user = userEvent.setup();
    listMessagesMock.mockResolvedValueOnce(page([summary('message-a')]));
    deleteMessageMock.mockResolvedValue(undefined);

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    const first = screen.getAllByRole('listitem')[0];
    await user.click(within(first).getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(within(first).getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText(/Nie masz jeszcze zapisanych wiadomości/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Zapisane wiadomości' })).toHaveFocus();
  });

  it('loads the next page when the last visible item is deleted and more data exists', async () => {
    const user = userEvent.setup();
    listMessagesMock
      .mockResolvedValueOnce(
        page([summary('message-a')], { hasMore: true, nextCursor: 'cursor-1' }),
      )
      .mockResolvedValueOnce(page([summary('message-b')]));
    deleteMessageMock.mockResolvedValue(undefined);

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    const first = screen.getAllByRole('listitem')[0];
    await user.click(within(first).getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(within(first).getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText('message-b')).toBeInTheDocument();
    expect(listMessagesMock).toHaveBeenNthCalledWith(2, { cursor: 'cursor-1' });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText(/Nie masz jeszcze zapisanych wiadomości/)).not.toBeInTheDocument();
  });

  it('shows the empty state after deleting the only item without more pages', async () => {
    const user = userEvent.setup();
    listMessagesMock.mockResolvedValueOnce(page([summary('message-a')]));
    deleteMessageMock.mockResolvedValue(undefined);

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    const first = screen.getAllByRole('listitem')[0];
    await user.click(within(first).getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(within(first).getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText(/Nie masz jeszcze zapisanych wiadomości/)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pobierz więcej' })).not.toBeInTheDocument();
    expect(listMessagesMock).toHaveBeenCalledTimes(1);
  });

  it('announces a message that was already deleted on the server', async () => {
    const user = userEvent.setup();
    listMessagesMock.mockResolvedValueOnce(page([summary('message-a'), summary('message-b')]));
    deleteMessageMock.mockRejectedValue(new ApiError(404, 'MESSAGE_NOT_FOUND', 'Brak.'));

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    const first = screen.getAllByRole('listitem')[0];
    await user.click(within(first).getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(within(first).getByRole('button', { name: 'Tak, usuń' }));

    expect(await screen.findByText('Wiadomość była już usunięta.')).toBeInTheDocument();
    expect(screen.queryByText('message-a')).not.toBeInTheDocument();
    expect(screen.getByText('message-b')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the list when deletion fails for another reason', async () => {
    const user = userEvent.setup();
    listMessagesMock.mockResolvedValueOnce(page([summary('message-a'), summary('message-b')]));
    deleteMessageMock.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Błąd serwera.'));

    render(<MessagesPanel />);

    await screen.findByText('message-a');
    const first = screen.getAllByRole('listitem')[0];
    await user.click(within(first).getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(within(first).getByRole('button', { name: 'Tak, usuń' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Wystąpił błąd serwera. Spróbuj ponownie.');
    expect(screen.getByText('message-a')).toBeInTheDocument();
    expect(screen.getByText('message-b')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('Wiadomość była już usunięta.')).not.toBeInTheDocument();
  });

  it('aborts the initial request on unmount', () => {
    listMessagesMock.mockResolvedValue(page([]));

    const { unmount } = render(<MessagesPanel />);
    const signal = (listMessagesMock.mock.calls[0][0] as { signal: AbortSignal }).signal;

    unmount();

    expect(signal.aborted).toBe(true);
  });
});
