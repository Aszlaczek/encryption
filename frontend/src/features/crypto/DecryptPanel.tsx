import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CopyButton, FormField, describedBy } from '../../shared/ui';
import { decryptPackage } from './api';
import { formatNumber } from '../../shared/format';
import { PACKAGE_MAX_LENGTH, validatePackage } from './limits';
import { describeCryptoError } from './messages';

type DecryptPanelProps = {
  onSessionExpired?: () => void;
};

export function DecryptPanel({ onSessionExpired }: DecryptPanelProps) {
  const [pkg, setPkg] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const trimmedLength = pkg.trim().length;
  const hint = `Limit: ${formatNumber(PACKAGE_MAX_LENGTH)} znaków. Wpisano: ${formatNumber(
    trimmedLength,
  )} / ${formatNumber(PACKAGE_MAX_LENGTH)}.`;

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const validation = validatePackage(pkg);
    if (!validation.ok) {
      showFieldError(validation.message);
      return;
    }

    setFieldError(undefined);
    setFormError(null);
    setPending(true);
    try {
      const result = await decryptPackage(pkg.trim());
      setPlaintext(result.plaintext);
    } catch (error) {
      const failure = describeCryptoError(error, 'package');
      if (failure.kind === 'field') {
        showFieldError(failure.message);
      } else {
        setFormError(failure.message);
        if (failure.kind === 'session') {
          onSessionExpired?.();
        }
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="crypto-panel" aria-labelledby="decrypt-heading">
      <h3 id="decrypt-heading">Deszyfrowanie</h3>
      <p className="crypto-panel__lead">
        Wklej pakiet utworzony na tym koncie. Odszyfrowana treść jest wyświetlana wyłącznie jako
        tekst.
      </p>

      {formError ? (
        <div className="alert alert--error" role="alert" tabIndex={-1} ref={alertRef}>
          {formError}
        </div>
      ) : null}

      <form className="crypto-form" onSubmit={handleSubmit} noValidate aria-busy={pending}>
        <FormField
          id="decrypt-package"
          label="Pakiet do odszyfrowania"
          hint={hint}
          error={fieldError}
        >
          <textarea
            ref={textareaRef}
            className="form-field__input form-field__textarea"
            id="decrypt-package"
            name="package"
            rows={6}
            required
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            disabled={pending}
            value={pkg}
            onChange={(event) => setPkg(event.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy('decrypt-package', hint, fieldError)}
          />
        </FormField>

        <button className="button button--primary" type="submit" disabled={pending}>
          {pending ? 'Deszyfrowanie…' : 'Odszyfruj'}
        </button>

        <p className="visually-hidden" role="status">
          {pending ? 'Trwa deszyfrowanie…' : ''}
        </p>
      </form>

      {plaintext !== null ? (
        <section className="crypto-result" aria-labelledby="decrypt-result-heading">
          <h4 id="decrypt-result-heading">Odszyfrowana treść</h4>
          <pre
            className="crypto-result__value crypto-result__value--text"
            role="group"
            aria-label="Odszyfrowana treść"
            tabIndex={0}
          >
            {plaintext}
          </pre>
          <CopyButton value={plaintext} label="Kopiuj treść" copiedLabel="Skopiowano treść" />
        </section>
      ) : null}
    </section>
  );
}
