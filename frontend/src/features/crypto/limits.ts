import { formatNumber } from './format';

/** Limits mirror `docs/API.md`; the backend stays authoritative. */
export const PLAINTEXT_MAX_CODE_POINTS = 10_000;
export const PLAINTEXT_MAX_BYTES = 40_000;
export const PACKAGE_MAX_LENGTH = 56_000;

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function validatePlaintext(value: string): ValidationResult {
  if (value.trim().length === 0) {
    return { ok: false, message: 'Wpisz treść wiadomości.' };
  }
  if (countCodePoints(value) > PLAINTEXT_MAX_CODE_POINTS) {
    return {
      ok: false,
      message: `Treść może mieć maksymalnie ${formatNumber(PLAINTEXT_MAX_CODE_POINTS)} znaków.`,
    };
  }
  if (utf8ByteLength(value) > PLAINTEXT_MAX_BYTES) {
    return {
      ok: false,
      message: `Treść może mieć maksymalnie ${formatNumber(PLAINTEXT_MAX_BYTES)} bajtów w UTF-8.`,
    };
  }
  return { ok: true };
}

export function validatePackage(value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'Wklej pakiet do odszyfrowania.' };
  }
  if (trimmed.length > PACKAGE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Pakiet może mieć maksymalnie ${formatNumber(PACKAGE_MAX_LENGTH)} znaków.`,
    };
  }
  return { ok: true };
}
