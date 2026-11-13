import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api';
import { setClipboard } from '../../test/clipboard';
import { MessageListItem } from './MessageListItem';

const { getMessageMock, decryptMessageMock } = vi.hoisted(() => ({
  getMessageMock: vi.fn(),
  decryptMessageMock: vi.fn(),
}));

vi.mock('./api', () => ({
  getMessage: getMessageMock,
  decryptMessage: decryptMessageMock,
}));

const message = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-11-13T10:15:00Z',
};

beforeEach(() => {
  getMessageMock.mockReset();
  decryptMessageMock.mockReset();
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
});
