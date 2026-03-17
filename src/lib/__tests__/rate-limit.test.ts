import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  it('allows requests within the limit', () => {
    const config = { maxRequests: 3, windowMs: 60_000 };
    const id = `test-allow-${Date.now()}`;

    const r1 = checkRateLimit(id, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit(id, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit(id, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests beyond the limit', () => {
    const config = { maxRequests: 2, windowMs: 60_000 };
    const id = `test-block-${Date.now()}`;

    checkRateLimit(id, config);
    checkRateLimit(id, config);

    const r3 = checkRateLimit(id, config);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('different keys do not affect each other', () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    const idA = `test-iso-a-${Date.now()}`;
    const idB = `test-iso-b-${Date.now()}`;

    checkRateLimit(idA, config); // uses up idA's quota

    const rB = checkRateLimit(idB, config);
    expect(rB.allowed).toBe(true);
    expect(rB.remaining).toBe(0);

    // idA should now be blocked
    const rA = checkRateLimit(idA, config);
    expect(rA.allowed).toBe(false);
  });
});
