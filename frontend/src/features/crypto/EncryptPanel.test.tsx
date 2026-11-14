import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api';
import { setClipboard } from '../../test/clipboard';
import { EncryptPanel } from './EncryptPanel';

const { encryptMock, saveMock } = vi.hoisted(() => ({
  encryptMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock('./api', () => ({
  encryptPlaintext: encryptMock,
  saveMessage: saveMock,
}));

beforeEach(() => {
  encryptMock.mockReset();
  saveMock.mockReset();
});

afterEach(() => {
  setClipboard(undefined);
});

function fillPlaintext(value: string) {
  fireEvent.change(screen.getByLabelText('Treść wiadomości'), { target: { value } });
}

describe('EncryptPanel', () => {
  it('associates the label, the limit hint and the textarea', () => {
    render(<EncryptPanel />);

    const textarea = screen.getByLabelText('Treść wiadomości');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('aria-describedby', 'encrypt-plaintext-hint');
    expect(screen.getByText(/Limit: 10 000 znaków i 40 000 B UTF-8/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Szyfruj' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Szyfruj i zapisz' })).toBeEnabled();
  });

  it('counts code points and UTF-8 bytes while typing', () => {
    render(<EncryptPanel />);

    fillPlaintext('Zażółć 🔐');

    expect(screen.getByText(/Wpisano: 8 \/ 10 000 znaków, 15 \/ 40 000 B/)).toBeInTheDocument();
  });

  it('blocks an empty submit without calling the API', async () => {
    const user = userEvent.setup();
    render(<EncryptPanel />);

    await user.click(screen.getByRole('button', { name: 'Szyfruj' }));

    expect(encryptMock).not.toHaveBeenCalled();
    expect(screen.getByText('Wpisz treść wiadomości.')).toHaveAttribute(
      'id',
      'encrypt-plaintext-error',
    );
    expect(screen.getByLabelText('Treść wiadomości')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Treść wiadomości')).toHaveFocus();
  });

  it('encrypts without saving and renders the package as selectable text', async () => {
    const user = userEvent.setup();
    encryptMock.mockResolvedValue({ package: 'v1.k1.nonce.cipher.tag' });
    render(<EncryptPanel />);

    fillPlaintext('tajna treść');
    await user.click(screen.getByRole('button', { name: 'Szyfruj' }));

    expect(encryptMock).toHaveBeenCalledWith('tajna treść');
    expect(saveMock).not.toHaveBeenCalled();
    const region = await screen.findByRole('region', { name: 'Pakiet zaszyfrowany' });
    expect(within(region).getByText('v1.k1.nonce.cipher.tag')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Kopiuj pakiet' })).toBeInTheDocument();
  });

  it('saves separately and shows the id, timestamp and saved package', async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue({
      id: 'msg-1',
      createdAt: '2026-11-13T10:15:00Z',
      package: 'v1.saved.package',
    });
    render(<EncryptPanel />);

    fillPlaintext('do zapisu');
    await user.click(screen.getByRole('button', { name: 'Szyfruj i zapisz' }));

    expect(saveMock).toHaveBeenCalledWith('do zapisu');
    expect(encryptMock).not.toHaveBeenCalled();
    const region = await screen.findByRole('region', { name: 'Wiadomość zapisana' });
    expect(within(region).getByText('msg-1')).toBeInTheDocument();
    expect(within(region).getByText('v1.saved.package')).toBeInTheDocument();
    const time = region.querySelector('time');
    expect(time).toHaveAttribute('datetime', '2026-11-13T10:15:00Z');
    expect(time?.textContent).not.toBe('');
    expect(
      within(region).getByRole('button', { name: 'Kopiuj zapisany pakiet' }),
    ).toBeInTheDocument();
  });

  it('disables both actions and announces progress while pending', async () => {
    const user = userEvent.setup();
    let resolveEncrypt: ((value: { package: string }) => void) | undefined;
    encryptMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEncrypt = resolve;
        }),
    );
    render(<EncryptPanel />);

    fillPlaintext('abc');
    await user.click(screen.getByRole('button', { name: 'Szyfruj' }));

    expect(screen.getByRole('button', { name: 'Szyfrowanie…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Szyfruj i zapisz' })).toBeDisabled();
    expect(screen.getByLabelText('Treść wiadomości')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Trwa szyfrowanie…');

    resolveEncrypt?.({ package: 'v1.done' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Szyfruj' })).toBeEnabled());
  });

  it('maps field violations onto the textarea', async () => {
    const user = userEvent.setup();
    encryptMock.mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', 'Popraw dane.', {
        fieldErrors: [
          { field: 'plaintext', code: 'TOO_LONG', message: 'Maksymalnie 10 000 znaków.' },
        ],
      }),
    );
    render(<EncryptPanel />);

    fillPlaintext('abc');
    await user.click(screen.getByRole('button', { name: 'Szyfruj' }));

    expect(await screen.findByText('Maksymalnie 10 000 znaków.')).toHaveAttribute(
      'id',
      'encrypt-plaintext-error',
    );
    expect(screen.getByLabelText('Treść wiadomości')).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the Retry-After value for 429', async () => {
    const user = userEvent.setup();
    encryptMock.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele.', { retryAfterSeconds: 7 }),
    );
    render(<EncryptPanel />);

    fillPlaintext('abc');
    await user.click(screen.getByRole('button', { name: 'Szyfruj' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Zbyt wiele operacji. Spróbuj ponownie za 7 s.');
    expect(alert).toHaveFocus();
  });

  it('ends the session on 401', async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();
    encryptMock.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Brak sesji.'));
    render(<EncryptPanel onSessionExpired={onSessionExpired} />);

    fillPlaintext('abc');
    await user.click(screen.getByRole('button', { name: 'Szyfruj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sesja wygasła. Zaloguj się ponownie.',
    );
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure', async () => {
    const user = userEvent.setup();
    encryptMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<EncryptPanel />);

    fillPlaintext('abc');
    await user.click(screen.getByRole('button', { name: 'Szyfruj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.',
    );
  });

  it('copies the encrypted package through the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    encryptMock.mockResolvedValue({ package: 'v1.copy.me' });
    render(<EncryptPanel />);

    fillPlaintext('abc');
    await user.click(screen.getByRole('button', { name: 'Szyfruj' }));
    await user.click(await screen.findByRole('button', { name: 'Kopiuj pakiet' }));

    expect(writeText).toHaveBeenCalledWith('v1.copy.me');
    expect(screen.getByText('Skopiowano pakiet')).toBeInTheDocument();
  });

  it('keeps the text and shows the rate-limit message when saving fails', async () => {
    const user = userEvent.setup();
    saveMock.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele.', { retryAfterSeconds: 9 }),
    );
    render(<EncryptPanel />);

    fillPlaintext('do zapisu');
    await user.click(screen.getByRole('button', { name: 'Szyfruj i zapisz' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Zbyt wiele operacji. Spróbuj ponownie za 9 s.');
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText('Treść wiadomości')).toHaveValue('do zapisu');
    expect(screen.getByRole('button', { name: 'Szyfruj i zapisz' })).toBeEnabled();
    expect(screen.queryByRole('region', { name: 'Wiadomość zapisana' })).not.toBeInTheDocument();
  });

  it('ends the session when saving returns 401', async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();
    saveMock.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Brak sesji.'));
    render(<EncryptPanel onSessionExpired={onSessionExpired} />);

    fillPlaintext('abc');
    await user.click(screen.getByRole('button', { name: 'Szyfruj i zapisz' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sesja wygasła. Zaloguj się ponownie.',
    );
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Wiadomość zapisana' })).not.toBeInTheDocument();
  });
});
