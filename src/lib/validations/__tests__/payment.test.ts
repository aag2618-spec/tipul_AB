/**
 * payClientDebtsSchema — combined receipt fields.
 * Validates the opt-in combinedReceipt / combinedReceiptDescription additions
 * are backward compatible and that the schema stays strict.
 */
import { describe, it, expect } from "vitest";
import { payClientDebtsSchema } from "../payment";

const base = {
  clientId: "client-1",
  paymentIds: ["p1"],
  totalAmount: 100,
  method: "CASH" as const,
};

describe("payClientDebtsSchema — combined receipt fields", () => {
  it("accepts a body without the new fields (backward compatible)", () => {
    expect(payClientDebtsSchema.safeParse(base).success).toBe(true);
  });

  it("accepts combinedReceipt (boolean) + combinedReceiptDescription (string)", () => {
    const r = payClientDebtsSchema.safeParse({
      ...base,
      combinedReceipt: true,
      combinedReceiptDescription: "קבלה מאוחדת לקופת חולים",
    });
    expect(r.success).toBe(true);
  });

  it("accepts combinedReceipt: false explicitly", () => {
    expect(payClientDebtsSchema.safeParse({ ...base, combinedReceipt: false }).success).toBe(true);
  });

  it("rejects a non-boolean combinedReceipt", () => {
    expect(
      payClientDebtsSchema.safeParse({ ...base, combinedReceipt: "yes" }).success,
    ).toBe(false);
  });

  it("rejects a combinedReceiptDescription longer than 500 chars", () => {
    expect(
      payClientDebtsSchema.safeParse({
        ...base,
        combinedReceipt: true,
        combinedReceiptDescription: "x".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("stays strict — rejects unknown fields", () => {
    expect(
      payClientDebtsSchema.safeParse({ ...base, someUnknownField: 1 }).success,
    ).toBe(false);
  });
});
