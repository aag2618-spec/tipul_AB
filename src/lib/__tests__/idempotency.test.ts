/**
 * Unit tests — src/lib/idempotency.ts (Stage 1.11)
 *
 * מבוסס על הזמנת מפתח (statusCode=0) → fn → update ל-200.
 * race-safety אמיתית נבדקת ב-Stage 1.16 עם Docker Postgres.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const deleteOne = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();
const alertCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    idempotencyKey: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => deleteOne(...a),
      upsert: (...a: unknown[]) => upsert(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
    adminAlert: {
      create: (...a: unknown[]) => alertCreate(...a),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  withIdempotency,
  persistIdempotencyFailure,
  cleanupExpiredIdempotencyKeys,
} from "../idempotency";

const ctx = { key: "user-1:abc", method: "POST", path: "/api/x" };

describe("withIdempotency — reserve/execute/finalize flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("executes fn once when key does not exist — reserve + fn + update", async () => {
    create.mockResolvedValueOnce({});
    update.mockResolvedValueOnce({});

    const fn = vi.fn().mockResolvedValueOnce({ ok: true });
    const result = await withIdempotency(ctx, fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.statusCode).toBe(0);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.statusCode).toBe(200);
    expect(result).toEqual({ replay: false, data: { ok: true } });
  });

  it("on P2002 (concurrent reservation) — waits and returns replay", async () => {
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create.mockRejectedValueOnce(uniqueErr);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    findUnique.mockResolvedValueOnce({
      key: ctx.key,
      method: ctx.method,
      path: ctx.path,
      statusCode: 200,
      response: { ok: true, stored: "yes" },
      expiresAt: future,
    });

    const fn = vi.fn();
    const result = await withIdempotency(ctx, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(result.replay).toBe(true);
    if (result.replay === true) {
      expect(result.data).toEqual({ ok: true, stored: "yes" });
      expect(result.storedStatusCode).toBe(200);
    }
  });

  it("re-runs when the existing reserved row is expired", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create
      .mockRejectedValueOnce(uniqueErr) // first attempt — conflict with expired row
      .mockResolvedValueOnce({}); // second attempt (recursive) — success
    findUnique.mockResolvedValueOnce({
      key: ctx.key,
      method: ctx.method,
      path: ctx.path,
      statusCode: 200,
      response: { old: true },
      expiresAt: past,
    });
    deleteOne.mockResolvedValueOnce({});
    update.mockResolvedValueOnce({});

    const fn = vi.fn().mockResolvedValueOnce({ fresh: true });
    const result = await withIdempotency(ctx, fn);

    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ replay: false, data: { fresh: true } });
  });

  it("creates IDEMPOTENCY_REPLAY_OF_FAILURE alert on replay of 5xx", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create.mockRejectedValueOnce(uniqueErr);
    findUnique.mockResolvedValueOnce({
      key: ctx.key,
      method: ctx.method,
      path: ctx.path,
      statusCode: 502,
      response: { error: "upstream" },
      expiresAt: future,
    });
    alertCreate.mockResolvedValueOnce({});

    const fn = vi.fn();
    const result = await withIdempotency(ctx, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(result.replay).toBe(true);
    expect(alertCreate).toHaveBeenCalledTimes(1);
    const alertCall = alertCreate.mock.calls[0][0];
    expect(alertCall.data.type).toBe("IDEMPOTENCY_REPLAY_OF_FAILURE");
  });

  it("does NOT alert on replay of success (200)", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create.mockRejectedValueOnce(uniqueErr);
    findUnique.mockResolvedValueOnce({
      statusCode: 200,
      response: { ok: true },
      expiresAt: future,
      key: ctx.key,
      method: ctx.method,
      path: ctx.path,
    });

    const fn = vi.fn();
    await withIdempotency(ctx, fn);

    expect(alertCreate).not.toHaveBeenCalled();
  });

  it("deletes the reservation when fn throws", async () => {
    create.mockResolvedValueOnce({});
    deleteOne.mockResolvedValueOnce({});
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom"));

    await expect(withIdempotency(ctx, fn)).rejects.toThrow("boom");
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("non-P2002 error from reserve bubbles up", async () => {
    const otherErr = Object.assign(new Error("db down"), { code: "P1001" });
    create.mockRejectedValueOnce(otherErr);

    const fn = vi.fn();
    await expect(withIdempotency(ctx, fn)).rejects.toThrow("db down");
    expect(fn).not.toHaveBeenCalled();
  });
});

// ─── Stage 1.17 pre-work tests (M-R2-1, M-R2-2) ───────────────────────────

describe("withIdempotency — inFlight: 'conflict' variant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns {replay: 'in_flight'} immediately when key is in-flight", async () => {
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create.mockRejectedValueOnce(uniqueErr);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    findUnique.mockResolvedValueOnce({
      key: ctx.key,
      method: ctx.method,
      path: ctx.path,
      statusCode: 0, // in-flight
      response: {},
      expiresAt: future,
    });

    const fn = vi.fn();
    const result = await withIdempotency(
      { ...ctx, inFlight: "conflict" },
      fn
    );

    expect(fn).not.toHaveBeenCalled();
    expect(result.replay).toBe("in_flight");
  });

  it("conflict mode still returns final result when already completed", async () => {
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create.mockRejectedValueOnce(uniqueErr);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    findUnique.mockResolvedValueOnce({
      key: ctx.key,
      method: ctx.method,
      path: ctx.path,
      statusCode: 200,
      response: { final: true },
      expiresAt: future,
    });

    const fn = vi.fn();
    const result = await withIdempotency(
      { ...ctx, inFlight: "conflict" },
      fn
    );

    expect(fn).not.toHaveBeenCalled();
    expect(result.replay).toBe(true);
    if (result.replay === true) {
      expect(result.data).toEqual({ final: true });
    }
  });
});

describe("withIdempotency — wait mode timeout → in_flight", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns {replay: 'in_flight'} when winner exceeds waitTimeoutMs", async () => {
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create.mockRejectedValueOnce(uniqueErr);
    const future = new Date(Date.now() + 60 * 60 * 1000);
    // waitForIdempotencyResolution polls findUnique — always sees statusCode=0.
    findUnique.mockResolvedValue({
      key: ctx.key,
      method: ctx.method,
      path: ctx.path,
      statusCode: 0,
      response: {},
      expiresAt: future,
    });

    const fn = vi.fn();
    const result = await withIdempotency(
      { ...ctx, waitTimeoutMs: 100 }, // timeout קצר לטסט
      fn
    );

    expect(fn).not.toHaveBeenCalled();
    expect(result.replay).toBe("in_flight");
  });
});

describe("withIdempotency — stuck-poller retry (M-R2-2)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("retries when winner deletes row during wait (fn throws)", async () => {
    // Scenario: caller B gets P2002, enters wait, but winner A deletes the
    // row because A's fn threw. B should retry as a new winner, not throw.
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create
      .mockRejectedValueOnce(uniqueErr) // first: conflict with winner
      .mockResolvedValueOnce({}); // second (recursive): success
    // poller sees null (winner deleted row)
    findUnique.mockResolvedValue(null);
    update.mockResolvedValueOnce({});

    const fn = vi.fn().mockResolvedValueOnce({ retryWon: true });
    const result = await withIdempotency(
      { ...ctx, waitTimeoutMs: 100 },
      fn
    );

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ replay: false, data: { retryWon: true } });
  });

  it("throws after max recursion depth exceeded", async () => {
    const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });
    create.mockRejectedValue(uniqueErr); // אינסופי — תמיד P2002
    findUnique.mockResolvedValue(null); // אינסופי — תמיד אין רשומה

    const fn = vi.fn();
    await expect(
      withIdempotency({ ...ctx, waitTimeoutMs: 50 }, fn)
    ).rejects.toThrow(/max recursion depth/);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("persistIdempotencyFailure", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("upserts with the supplied statusCode", async () => {
    upsert.mockResolvedValueOnce({});
    await persistIdempotencyFailure(ctx, 402, { error: "insufficient_funds" });

    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({ key: ctx.key });
    expect(call.create.statusCode).toBe(402);
    expect(call.update.statusCode).toBe(402);
  });
});

describe("cleanupExpiredIdempotencyKeys", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("deletes all rows with expiresAt < now and returns count", async () => {
    deleteMany.mockResolvedValueOnce({ count: 7 });
    const count = await cleanupExpiredIdempotencyKeys();
    expect(count).toBe(7);

    const call = deleteMany.mock.calls[0][0];
    expect(call.where.expiresAt.lt).toBeInstanceOf(Date);
  });
});
