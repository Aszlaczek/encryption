import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api';
import { setClipboard } from '../../test/clipboard';
import { MessageListItem } from './MessageListItem';

const { getMessageMock, decryptMessageMock, deleteMessageMock } = vi.hoisted(() => ({
  getMessageMock: vi.fn(),
  decryptMessageMock: vi.fn(),
  deleteMessageMock: vi.fn(),
}));

vi.mock('./api', () => ({
  getMessage: getMessageMock,
  decryptMessage: decryptMessageMock,
  deleteMessage: deleteMessageMock,
}));

const message = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-11-13T10:15:00Z',
};

beforeEach(() => {
  getMessageMock.mockReset();
  decryptMessageMock.mockReset();
  deleteMessageMock.mockReset();
});

afterEach(() => {
  setClipboard(undefined);
});

describe('MessageListItem', () => {
  it('shows the id and timestamp without downloading content', () => {
    render(<MessageListItem message={message} />);

    expect(screen.getByText(message.id)).toBeInTheDocument();
    const time = screen.getByText((_, node) => node?.tagName === 'TIME');
    expect(time).toHaveAttribute('datetime', message.createdAt);
    expect(time.textContent).not.toBe('');
    expect(getMessageMock).not.toHaveBeenCalled();
    expect(decryptMessageMock).not.toHaveBeenCalled();
  });

  it('loads the package only after a click and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    getMessageMock.mockResolvedValue({ ...message, package: 'v1.k1.nonce.cipher.tag' });

    render(<MessageListItem message={message} />);

    await user.click(screen.getByRole('button', { name: /Pokaż pakiet wiadomości/ }));

    expect(getMessageMock).toHaveBeenCalledWith(message.id);
    const region = await screen.findByRole('region', { name: 'Pakiet wiadomości' });
    expect(within(region).getByText('v1.k1.nonce.cipher.tag')).toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Kopiuj pakiet' }));
    expect(writeText).toHaveBeenCalledWith('v1.k1.nonce.cipher.tag');
    expect(within(region).getByText('Skopiowano pakiet')).toBeInTheDocument();
  });

  it('hides the package on a second click without refetching', async () => {
    const user = userEvent.setup();
    getMessageMock.mockResolvedValue({ ...message, package: 'v1.k1.nonce.cipher.tag' });

    render(<MessageListItem message={message} />);

    await user.click(screen.getByRole('button', { name: /Pokaż pakiet wiadomości/ }));
    await screen.findByRole('region', { name: 'Pakiet wiadomości' });

    await user.click(screen.getByRole('button', { name: /Ukryj pakiet wiadomości/ }));

    expect(screen.queryByRole('region', { name: 'Pakiet wiadomości' })).not.toBeInTheDocument();
    expect(getMessageMock).toHaveBeenCalledTimes(1);
  });

  it('decrypts on demand and renders markup as text', async () => {
    const user = userEvent.setup();
    const payload = '<img src=x onerror="window.__messageXss=1">';
    decryptMessageMock.mockResolvedValue({ plaintext: payload });
    const { container } = render(<MessageListItem message={message} />);

    expect(decryptMessageMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Odszyfruj wiadomość/ }));

    expect(decryptMessageMock).toHaveBeenCalledWith(message.id);
    const region = await screen.findByRole('region', { name: 'Odszyfrowana treść' });
    expect(within(region).getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect((window as unknown as { __messageXss?: number }).__messageXss).toBeUndefined();
  });

  it('copies the decrypted text', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    decryptMessageMock.mockResolvedValue({ plaintext: 'tajna treść' });

    render(<MessageListItem message={message} />);

    await user.click(screen.getByRole('button', { name: /Odszyfruj wiadomość/ }));
    await user.click(await screen.findByRole('button', { name: 'Kopiuj treść' }));

    expect(writeText).toHaveBeenCalledWith('tajna treść');
    expect(screen.getByText('Skopiowano treść')).toBeInTheDocument();
  });

  it('disables both actions while an item request is pending', async () => {
    const user = userEvent.setup();
    let resolveDecrypt: ((value: { plaintext: string }) => void) | undefined;
    decryptMessageMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDecrypt = resolve;
        }),
    );

    render(<MessageListItem message={message} />);

    await user.click(screen.getByRole('button', { name: /Odszyfruj wiadomość/ }));

    expect(screen.getByRole('button', { name: /Odszyfruj wiadomość/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Pokaż pakiet wiadomości/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Trwa deszyfrowanie wiadomości…');

    resolveDecrypt?.({ plaintext: 'gotowe' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Odszyfruj wiadomość/ })).toBeEnabled(),
    );
  });

  it('explains a missing message and focuses the alert', async () => {
    const user = userEvent.setup();
    decryptMessageMock.mockRejectedValue(new ApiError(404, 'MESSAGE_NOT_FOUND', 'Brak.'));

    render(<MessageListItem message={message} />);

    await user.click(screen.getByRole('button', { name: /Odszyfruj wiadomość/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Ta wiadomość nie istnieje lub została usunięta. Odśwież listę.',
    );
    expect(alert).toHaveFocus();
  });

  it('explains undecryptable data', async () => {
    const user = userEvent.setup();
    decryptMessageMock.mockRejectedValue(
      new ApiError(500, 'MESSAGE_UNDECRYPTABLE', 'Nie udało się.'),
    );

    render(<MessageListItem message={message} />);

    await user.click(screen.getByRole('button', { name: /Odszyfruj wiadomość/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się odszyfrować tej wiadomości. Dane mogą być uszkodzone lub klucz się zmienił.',
    );
  });

  it('ends the session on 401 without leaving a stale error', async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();
    decryptMessageMock.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Brak sesji.'));

    render(<MessageListItem message={message} onSessionExpired={onSessionExpired} />);

    await user.click(screen.getByRole('button', { name: /Odszyfruj wiadomość/ }));

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting and can be cancelled', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();

    render(<MessageListItem message={message} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: /Usuń wiadomość/ }));

    const group = screen.getByRole('group', { name: 'Potwierdzenie usunięcia wiadomości' });
    expect(within(group).getByText(/Usunięcie jest trwałe/)).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Tak, usuń' })).toHaveFocus();
    expect(deleteMessageMock).not.toHaveBeenCalled();

    await user.click(within(group).getByRole('button', { name: 'Anuluj' }));

    expect(
      screen.queryByRole('group', { name: 'Potwierdzenie usunięcia wiadomości' }),
    ).not.toBeInTheDocument();
    expect(deleteMessageMock).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation and reports the removed id', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    deleteMessageMock.mockResolvedValue(undefined);

    render(<MessageListItem message={message} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    expect(deleteMessageMock).toHaveBeenCalledWith(message.id);
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(message.id));
  });

  it('blocks every action while the deletion is pending', async () => {
    const user = userEvent.setup();
    let resolveDelete: (() => void) | undefined;
    deleteMessageMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(<MessageListItem message={message} />);

    await user.click(screen.getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    expect(screen.getByRole('button', { name: /Odszyfruj wiadomość/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Pokaż pakiet wiadomości/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Usuń wiadomość/ })).toBeDisabled();
    expect(
      screen.getByRole('group', { name: 'Potwierdzenie usunięcia wiadomości' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Trwa usuwanie wiadomości…');

    resolveDelete?.();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Pokaż pakiet wiadomości/ })).toBeEnabled(),
    );
  });

  it('treats an already missing message as deleted', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    deleteMessageMock.mockRejectedValue(new ApiError(404, 'MESSAGE_NOT_FOUND', 'Brak.'));

    render(<MessageListItem message={message} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(message.id, { alreadyGone: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the item and focuses the alert when deletion fails', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    deleteMessageMock.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Błąd serwera.'));

    render(<MessageListItem message={message} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Wystąpił błąd serwera. Spróbuj ponownie.');
    expect(alert).toHaveFocus();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByText(message.id)).toBeInTheDocument();
  });

  it('ends the session on 401 during deletion', async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();
    const onDeleted = vi.fn();
    deleteMessageMock.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Brak sesji.'));

    render(
      <MessageListItem
        message={message}
        onSessionExpired={onSessionExpired}
        onDeleted={onDeleted}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Usuń wiadomość/ }));
    await user.click(screen.getByRole('button', { name: 'Tak, usuń' }));

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
