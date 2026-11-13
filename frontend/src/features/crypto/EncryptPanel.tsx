import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CopyButton, FormField, describedBy } from '../../shared/ui';
import { encryptPlaintext, saveMessage, type SavedMessage } from './api';
import { formatDateTime, formatNumber } from './format';
import {
  PLAINTEXT_MAX_BYTES,
  PLAINTEXT_MAX_CODE_POINTS,
  countCodePoints,
  utf8ByteLength,
  validatePlaintext,
} from './limits';
import { describeCryptoError } from './messages';

type EncryptPanelProps = {
  onSessionExpired?: () => void;
};

type PendingAction = 'encrypt' | 'save' | null;

export function EncryptPanel({ onSessionExpired }: EncryptPanelProps) {
  const [plaintext, setPlaintext] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [packageValue, setPackageValue] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedMessage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const codePoints = countCodePoints(plaintext);
  const bytes = utf8ByteLength(plaintext);
  const hint = `Limit: ${formatNumber(PLAINTEXT_MAX_CODE_POINTS)} znaków i ${formatNumber(
    PLAINTEXT_MAX_BYTES,
  )} B UTF-8. Wpisano: ${formatNumber(codePoints)} / ${formatNumber(
    PLAINTEXT_MAX_CODE_POINTS,
  )} znaków, ${formatNumber(bytes)} / ${formatNumber(PLAINTEXT_MAX_BYTES)} B.`;

  useEffect(() => {
    if (formError) {
      alertRef.current?.focus();
    }
  }, [formError]);

  useEffect(() => {
    if (fieldError) {
      textareaRef.current?.focus();
    }
  }, [fieldError]);

  function showFieldError(message: string) {
    setFieldError(message);
    setFormError(null);
  }

  async function run(action: Exclude<PendingAction, null>, request: () => Promise<void>) {
    if (pending) {
      return;
    }
    const validation = validatePlaintext(plaintext);
    if (!validation.ok) {
      showFieldError(validation.message);
      return;
    }

    setFieldError(undefined);
    setFormError(null);
    setPending(action);
    try {
      await request();
    } catch (error) {
      const failure = describeCryptoError(error, 'plaintext');
      if (failure.kind === 'field') {
        showFieldError(failure.message);
      } else {
        setFormError(failure.message);
        if (failure.kind === 'session') {
          onSessionExpired?.();
        }
      }
    } finally {
      setPending(null);
    }
  }

  async function handleEncrypt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run('encrypt', async () => {
      const result = await encryptPlaintext(plaintext);
      setPackageValue(result.package);
    });
  }

  async function handleSave() {
    await run('save', async () => {
      const result = await saveMessage(plaintext);
      setSaved(result);
    });
  }

  return (
    <section className="crypto-panel" aria-labelledby="encrypt-heading">
      <h3 id="encrypt-heading">Szyfrowanie</h3>
      <p className="crypto-panel__lead">
        Zaszyfruj treść i skopiuj pakiet. „Szyfruj i zapisz” tworzy osobną wiadomość przypisaną do
        Twojego konta.
      </p>

      {formError ? (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={alertRef}>
          {formError}
        </div>
      ) : null}

      <form
        className="crypto-form"
        onSubmit={handleEncrypt}
        noValidate
        aria-busy={pending !== null}
      >
        <FormField id="encrypt-plaintext" label="Treść wiadomości" hint={hint} error={fieldError}>
          <textarea
            ref={textareaRef}
            className="form-field__input form-field__textarea"
            id="encrypt-plaintext"
            name="plaintext"
            rows={6}
            required
            disabled={pending !== null}
            value={plaintext}
            onChange={(event) => setPlaintext(event.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy('encrypt-plaintext', hint, fieldError)}
          />
        </FormField>

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={pending !== null}>
            {pending === 'encrypt' ? 'Szyfrowanie…' : 'Szyfruj'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={handleSave}
            disabled={pending !== null}
          >
            {pending === 'save' ? 'Zapisywanie…' : 'Szyfruj i zapisz'}
          </button>
        </div>

        <p className="visually-hidden" role="status">
          {pending === 'encrypt' ? 'Trwa szyfrowanie…' : ''}
          {pending === 'save' ? 'Trwa zapisywanie…' : ''}
        </p>
      </form>

      {packageValue ? (
        <section className="crypto-result" aria-labelledby="encrypt-result-heading">
          <h4 id="encrypt-result-heading">Pakiet zaszyfrowany</h4>
          <output className="crypto-result__value" aria-label="Pakiet zaszyfrowany">
            {packageValue}
          </output>
          <CopyButton value={packageValue} label="Kopiuj pakiet" copiedLabel="Skopiowano pakiet" />
        </section>
      ) : null}

      {saved ? (
        <section className="crypto-result" aria-labelledby="save-result-heading">
          <h4 id="save-result-heading">Wiadomość zapisana</h4>
          <p className="crypto-result__meta">
            ID: <code>{saved.id}</code>
          </p>
          <p className="crypto-result__meta">
            Zapisano: <time dateTime={saved.createdAt}>{formatDateTime(saved.createdAt)}</time>
          </p>
          <output className="crypto-result__value" aria-label="Pakiet zapisanej wiadomości">
            {saved.package}
          </output>
          <CopyButton
            value={saved.package}
            label="Kopiuj zapisany pakiet"
            copiedLabel="Skopiowano pakiet"
          />
        </section>
      ) : null}
    </section>
  );
}
