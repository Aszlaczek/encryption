import { useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../../shared/format';
import { CopyButton } from '../../shared/ui';
import { decryptMessage, getMessage, type MessageDetail, type MessageSummary } from './api';
import { describeMessageError } from './errors';

type MessageListItemProps = {
  message: MessageSummary;
  onSessionExpired?: () => void;
};

type PendingAction = 'package' | 'decrypt' | null;

/**
 * One saved message. The package and the plaintext are fetched only after an explicit click,
 * so opening the list never downloads message content in bulk.
 */
export function MessageListItem({ message, onSessionExpired }: MessageListItemProps) {
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [packageVisible, setPackageVisible] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const formattedDate = formatDateTime(message.createdAt);
  const packageHeadingId = `message-${message.id}-package-heading`;
  const plaintextHeadingId = `message-${message.id}-plaintext-heading`;

  useEffect(() => {
    if (error) {
      alertRef.current?.focus();
    }
  }, [error]);

  async function run(action: Exclude<PendingAction, null>, request: () => Promise<void>) {
    if (pending) {
      return;
    }
    setError(null);
    setPending(action);
    try {
      await request();
    } catch (requestError) {
      const failure = describeMessageError(requestError);
      if (failure.kind === 'session') {
        onSessionExpired?.();
      } else {
        setError(failure.message);
      }
    } finally {
      setPending(null);
    }
  }

  async function handlePackage() {
    if (detail && packageVisible) {
      setPackageVisible(false);
      return;
    }
    await run('package', async () => {
      const loaded = detail ?? (await getMessage(message.id));
      setDetail(loaded);
      setPackageVisible(true);
    });
  }

  async function handleDecrypt() {
    await run('decrypt', async () => {
      const result = await decryptMessage(message.id);
      setPlaintext(result.plaintext);
    });
  }

  const packageLabel = packageVisible ? 'Ukryj pakiet' : 'Pokaż pakiet';

  return (
    <li className="message-item">
      <h3 className="message-item__heading">
        <time dateTime={message.createdAt}>{formattedDate}</time>
      </h3>
      <p className="message-item__meta">
        ID: <code>{message.id}</code>
      </p>

      {error ? (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={alertRef}>
          {error}
        </div>
      ) : null}

      <div className="button-row">
        <button
          className="button button--secondary button--small"
          type="button"
          onClick={handlePackage}
          disabled={pending !== null}
          aria-label={`${packageLabel} wiadomości: ${formattedDate}`}
        >
          {pending === 'package' ? 'Pobieranie pakietu…' : packageLabel}
        </button>
        <button
          className="button button--secondary button--small"
          type="button"
          onClick={handleDecrypt}
          disabled={pending !== null}
          aria-label={`Odszyfruj wiadomość: ${formattedDate}`}
        >
          {pending === 'decrypt' ? 'Deszyfrowanie…' : 'Odszyfruj'}
        </button>
      </div>

      <p className="visually-hidden" role="status">
        {pending === 'package' ? 'Trwa pobieranie pakietu…' : ''}
        {pending === 'decrypt' ? 'Trwa deszyfrowanie wiadomości…' : ''}
      </p>

      {detail && packageVisible ? (
        <section className="message-result" aria-labelledby={packageHeadingId}>
          <h4 id={packageHeadingId}>Pakiet wiadomości</h4>
          <output className="message-result__value" aria-label="Pakiet wiadomości">
            {detail.package}
          </output>
          <CopyButton
            value={detail.package}
            label="Kopiuj pakiet"
            copiedLabel="Skopiowano pakiet"
          />
        </section>
      ) : null}

      {plaintext !== null ? (
        <section className="message-result" aria-labelledby={plaintextHeadingId}>
          <h4 id={plaintextHeadingId}>Odszyfrowana treść</h4>
          <pre className="message-result__value message-result__value--text">{plaintext}</pre>
          <CopyButton value={plaintext} label="Kopiuj treść" copiedLabel="Skopiowano treść" />
        </section>
      ) : null}
    </li>
  );
}
