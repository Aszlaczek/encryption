import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the project heading', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Szyfrowanie wiadomości');
  });

  it('links to the project repository', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: /repozytorium projektu/i })).toHaveAttribute(
      'href',
      'https://github.com/Aszlaczek/encryption',
    );
  });

  it('exposes the main landmark and skip link', () => {
    render(<App />);

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: /przejdź do treści/i })).toHaveAttribute(
      'href',
      '#main-content',
    );
  });
});
