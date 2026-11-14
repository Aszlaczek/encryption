import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api';
import { setClipboard } from '../../test/clipboard';
import { DecryptPanel } from './DecryptPanel';

const { decryptMock } = vi.hoisted(() => ({ decryptMock: vi.fn() }));

vi.mock('./api', () => ({
  decryptPackage: decryptMock,
}));

beforeEach(() => {
  decryptMock.mockReset();
});

afterEach(() => {
  setClipboard(undefined);
});

function fillPackage(value: string) {
  fireEvent.change(screen.getByLabelText('Pakiet do odszyfrowania'), { target: { value } });
}

describe('DecryptPanel', () => {
  it('associates the label, the limit hint and the textarea', () => {
    render(<DecryptPanel />);

    const textarea = screen.getByLabelText('Pakiet do odszyfrowania');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('aria-describedby', 'decrypt-package-hint');
    expect(textarea).toHaveAttribute('spellcheck', 'false');
    expect(textarea).toHaveAttribute('autocapitalize', 'off');
    expect(screen.getByText(/Limit: 56 000 znaków/)).toBeInTheDocument();
  });

  it('blocks an empty submit without calling the API', async () => {
    const user = userEvent.setup();
    render(<DecryptPanel />);

    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    expect(decryptMock).not.toHaveBeenCalled();
    expect(screen.getByText('Wklej pakiet do odszyfrowania.')).toHaveAttribute(
      'id',
      'decrypt-package-error',
    );
    expect(screen.getByLabelText('Pakiet do odszyfrowania')).toHaveFocus();
  });

  it('trims the pasted package but keeps the payload intact', async () => {
    const user = userEvent.setup();
    decryptMock.mockResolvedValue({ plaintext: 'treść' });
    render(<DecryptPanel />);

    fillPackage('  v1.k1.nonce.cipher.tag\n');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    expect(decryptMock).toHaveBeenCalledWith('v1.k1.nonce.cipher.tag');
  });

  it('renders the decrypted content as text and never creates markup', async () => {
    const user = userEvent.setup();
    const payload = '<img src=x onerror="window.__xss=1">';
    decryptMock.mockResolvedValue({ plaintext: payload });
    const { container } = render(<DecryptPanel />);

    fillPackage('v1.k1.nonce.cipher.tag');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    const region = await screen.findByRole('region', { name: 'Odszyfrowana treść' });
    expect(within(region).getByText(payload)).toBeInTheDocument();
    expect(region.querySelector('img')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('explains a malformed package', async () => {
    const user = userEvent.setup();
    decryptMock.mockRejectedValue(new ApiError(400, 'INVALID_PACKAGE_FORMAT', 'Zły format.'));
    render(<DecryptPanel />);

    fillPackage('nie-pakiet');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pakiet ma nieprawidłowy format. Wklej cały pakiet zaczynający się od v1.',
    );
  });

  it('explains a decryption failure separately from a malformed package', async () => {
    const user = userEvent.setup();
    decryptMock.mockRejectedValue(new ApiError(422, 'DECRYPT_FAILED', 'Tag nie pasuje.'));
    render(<DecryptPanel />);

    fillPackage('v1.k1.nonce.cipher.tag');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się odszyfrować pakietu. Sprawdź, czy pochodzi z tego konta i nie został zmieniony.',
    );
  });

  it('ends the session on 401', async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();
    decryptMock.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Brak sesji.'));
    render(<DecryptPanel onSessionExpired={onSessionExpired} />);

    fillPackage('v1.k1.nonce.cipher.tag');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sesja wygasła. Zaloguj się ponownie.',
    );
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('disables the form while decrypting', async () => {
    const user = userEvent.setup();
    let resolveDecrypt: ((value: { plaintext: string }) => void) | undefined;
    decryptMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDecrypt = resolve;
        }),
    );
    render(<DecryptPanel />);

    fillPackage('v1.k1.nonce.cipher.tag');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    expect(screen.getByRole('button', { name: 'Deszyfrowanie…' })).toBeDisabled();
    expect(screen.getByLabelText('Pakiet do odszyfrowania')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Trwa deszyfrowanie…');

    resolveDecrypt?.({ plaintext: 'gotowe' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Odszyfruj' })).toBeEnabled());
  });

  it('copies the decrypted text through the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    decryptMock.mockResolvedValue({ plaintext: 'tajna treść' });
    render(<DecryptPanel />);

    fillPackage('v1.k1.nonce.cipher.tag');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));
    await user.click(await screen.findByRole('button', { name: 'Kopiuj treść' }));

    expect(writeText).toHaveBeenCalledWith('tajna treść');
    expect(screen.getByText('Skopiowano treść')).toBeInTheDocument();
  });

  it('shows the Retry-After value for 429', async () => {
    const user = userEvent.setup();
    decryptMock.mockRejectedValue(
      new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele.', { retryAfterSeconds: 4 }),
    );
    render(<DecryptPanel />);

    fillPackage('v1.k1.nonce.cipher.tag');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Zbyt wiele operacji. Spróbuj ponownie za 4 s.');
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText('Pakiet do odszyfrowania')).toHaveValue('v1.k1.nonce.cipher.tag');
  });

  it('reports a network failure', async () => {
    const user = userEvent.setup();
    decryptMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<DecryptPanel />);

    fillPackage('v1.k1.nonce.cipher.tag');
    await user.click(screen.getByRole('button', { name: 'Odszyfruj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.',
    );
    expect(screen.queryByRole('region', { name: 'Odszyfrowana treść' })).not.toBeInTheDocument();
  });
});
