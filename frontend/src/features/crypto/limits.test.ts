import { describe, expect, it } from 'vitest';
import {
  PACKAGE_MAX_LENGTH,
  PLAINTEXT_MAX_BYTES,
  PLAINTEXT_MAX_CODE_POINTS,
  countCodePoints,
  utf8ByteLength,
  validatePackage,
  validatePlaintext,
} from './limits';

describe('countCodePoints', () => {
  it('counts code points instead of UTF-16 units', () => {
    expect(countCodePoints('🔐')).toBe(1);
    expect(countCodePoints('Zażółć')).toBe(6);
    expect(countCodePoints('')).toBe(0);
  });
});

describe('utf8ByteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(utf8ByteLength('a')).toBe(1);
    expect(utf8ByteLength('ż')).toBe(2);
    expect(utf8ByteLength('🔐')).toBe(4);
  });
});

describe('validatePlaintext', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(validatePlaintext('')).toMatchObject({ ok: false });
    expect(validatePlaintext('   \n\t')).toMatchObject({ ok: false });
  });

  it('accepts text at both limits and rejects one code point more', () => {
    const atLimit = '🔐'.repeat(PLAINTEXT_MAX_CODE_POINTS);
    expect(countCodePoints(atLimit)).toBe(PLAINTEXT_MAX_CODE_POINTS);
    expect(utf8ByteLength(atLimit)).toBe(PLAINTEXT_MAX_BYTES);
    expect(validatePlaintext(atLimit)).toEqual({ ok: true });

    expect(validatePlaintext(`${atLimit}a`)).toMatchObject({ ok: false });
  });

  it('keeps leading and trailing spaces in the payload', () => {
    expect(validatePlaintext('  treść  ')).toEqual({ ok: true });
  });
});

describe('validatePackage', () => {
  it('rejects an empty package after trimming', () => {
    expect(validatePackage('  \n ')).toMatchObject({ ok: false });
  });

  it('accepts a package at the length limit and rejects a longer one', () => {
    expect(validatePackage('a'.repeat(PACKAGE_MAX_LENGTH))).toEqual({ ok: true });
    expect(validatePackage('a'.repeat(PACKAGE_MAX_LENGTH + 1))).toMatchObject({ ok: false });
  });
});
