import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted } from '@/lib/encryption';

describe('encryption', () => {
  it('encrypt/decrypt round-trip returns original text', () => {
    const original = 'hello world 123 !@#$%';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('isEncrypted detects encrypted text', () => {
    const encrypted = encrypt('test');
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it('isEncrypted returns false for plain text', () => {
    expect(isEncrypted('just a regular string')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted('abc:def')).toBe(false);
  });

  it('encrypt produces different output for the same input (random salt)', () => {
    const input = 'same input';
    const a = encrypt(input);
    const b = encrypt(input);
    expect(a).not.toBe(b);
    // Both should still decrypt to the original
    expect(decrypt(a)).toBe(input);
    expect(decrypt(b)).toBe(input);
  });
});
