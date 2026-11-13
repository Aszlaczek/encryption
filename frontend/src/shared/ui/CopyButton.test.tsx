import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClipboard } from '../../test/clipboard';
import { CopyButton } from './CopyButton';

afterEach(() => {
  setClipboard(undefined);
});

describe('CopyButton', () => {
  it('copies the value and announces success', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CopyButton value="v1.pakiet" label="Kopiuj pakiet" copiedLabel="Skopiowano pakiet" />);

    await user.click(screen.getByRole('button', { name: 'Kopiuj pakiet' }));

    expect(writeText).toHaveBeenCalledWith('v1.pakiet');
    expect(await screen.findByRole('status')).toHaveTextContent('Skopiowano pakiet');
  });

  it('shows a manual-copy hint when the clipboard rejects', async () => {
    const user = userEvent.setup();
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    render(<CopyButton value="x" label="Kopiuj" copiedLabel="Skopiowano" />);

    await user.click(screen.getByRole('button', { name: 'Kopiuj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się skopiować. Zaznacz tekst i skopiuj ręcznie.',
    );
  });

  it('handles a missing Clipboard API without throwing', async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    render(<CopyButton value="x" label="Kopiuj" copiedLabel="Skopiowano" />);

    await user.click(screen.getByRole('button', { name: 'Kopiuj' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się skopiować');
  });
});
