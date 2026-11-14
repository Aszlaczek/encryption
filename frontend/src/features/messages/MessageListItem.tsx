import { useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../../shared/format';
import { CopyButton } from '../../shared/ui';
import {
  decryptMessage,
  deleteMessage,
  getMessage,
  type MessageDetail,
  type MessageSummary,
} from './api';
import { describeMessageError, isMissingMessage } from './errors';

type DeleteOptions = {
  /** The message was already gone on the server; the desired end state is reached. */
  alreadyGone?: boolean;
};

type MessageListItemProps = {
  message: MessageSummary;
  onSessionExpired?: () => void;
  onDeleted?: (id: string, options?: DeleteOptions) => void;
};

type PendingAction = 'package' | 'decrypt' | 'delete' | null;

/**
 * One saved message. The package and the plaintext are fetched only after an explicit click,
 * so opening the list never downloads message content in bulk. Deletion asks for an inline
 * confirmation and never relies on a native browser dialog.
 */
export function MessageListItem({ message, onSessionExpired, onDeleted }: MessageListItemProps) {
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [packageVisible, setPackageVisible] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const formattedDate = formatDateTime(message.createdAt);
  const packageHeadingId = `message-${message.id}-package-heading`;
  const plaintextHeadingId = `message-${message.id}-plaintext-heading`;

  useEffect(() => {
    if (error) {
      alertRef.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    }
  }, [confirming]);

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

  async function handleDelete() {
    if (pending) {
      return;
    }
    setError(null);
    setPending('delete');
    try {
      await deleteMessage(message.id);
      setDetail(null);
      setPlaintext(null);
      setPackageVisible(false);
      setConfirming(false);
      onDeleted?.(message.id);
    } catch (requestError) {
      if (isMissingMessage(requestError)) {
        setConfirming(false);
        onDeleted?.(message.id, { alreadyGone: true });
        return;
      }
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

  function toggleConfirm() {
    if (pending) {
      return;
    }
    setError(null);
    setConfirming((value) => !value);
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
        <button
          className="button button--danger button--small"
          type="button"
          onClick={toggleConfirm}
          disabled={pending !== null}
          aria-expanded={confirming}
          aria-label={`Usuń wiadomość: ${formattedDate}`}
        >
          {pending === 'delete' ? 'Usuwanie…' : 'Usuń'}
        </button>
      </div>

      {confirming ? (
        <div
          className="message-item__confirm"
          role="group"
          aria-label="Potwierdzenie usunięcia wiadomości"
          aria-busy={pending === 'delete'}
        >
          <p className="message-item__confirm-text">
            Usunięcie jest trwałe i nie można go cofnąć. Kopia pakietu nadal będzie możliwa do
            odszyfrowania.
          </p>
          <div className="button-row">
            <button
              className="button button--danger button--small"
              type="button"
              onClick={handleDelete}
              disabled={pending !== null}
              ref={confirmRef}
            >
              {pending === 'delete' ? 'Usuwanie…' : 'Tak, usuń'}
            </button>
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending !== null}
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : null}

      <p className="visually-hidden" role="status">
        {pending === 'package' ? 'Trwa pobieranie pakietu…' : ''}
        {pending === 'decrypt' ? 'Trwa deszyfrowanie wiadomości…' : ''}
        {pending === 'delete' ? 'Trwa usuwanie wiadomości…' : ''}
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
