import { useState } from 'react';

type CopyStatus = {
  tone: 'success' | 'error';
  message: string;
};

type CopyButtonProps = {
  value: string;
  label: string;
  copiedLabel: string;
};

/**
 * Copies `value` through the Clipboard API and reports the outcome next to the button.
 * It never falls back to storage or deprecated `execCommand`.
 */
export function CopyButton({ value, label, copiedLabel }: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus | null>(null);

  async function handleCopy() {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API is unavailable');
      }
      await navigator.clipboard.writeText(value);
      setStatus({ tone: 'success', message: copiedLabel });
    } catch {
      setStatus({
        tone: 'error',
        message: 'Nie udało się skopiować. Zaznacz tekst i skopiuj ręcznie.',
      });
    }
  }

  return (
    <div className="copy-button">
      <button className="button button--secondary button--small" type="button" onClick={handleCopy}>
        {label}
      </button>
      {status ? (
        <p
          className={`copy-button__status${
            status.tone === 'error' ? ' copy-button__status--error' : ''
          }`}
          role={status.tone === 'error' ? 'alert' : 'status'}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
