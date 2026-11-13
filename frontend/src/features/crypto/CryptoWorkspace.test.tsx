import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CryptoWorkspace } from './CryptoWorkspace';

describe('CryptoWorkspace', () => {
  it('renders the encryption and decryption panels together', () => {
    render(<CryptoWorkspace />);

    expect(
      screen.getByRole('heading', { name: 'Szyfrowanie i deszyfrowanie' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Szyfrowanie' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Deszyfrowanie' })).toBeInTheDocument();
    expect(screen.getByLabelText('Treść wiadomości')).toBeInTheDocument();
    expect(screen.getByLabelText('Pakiet do odszyfrowania')).toBeInTheDocument();
  });
});
