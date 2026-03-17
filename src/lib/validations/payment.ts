import { z } from "zod";
import { PaymentMethod, PaymentStatus, PaymentType } from "@prisma/client";

export const createPaymentSchema = z.object({
  clientId: z.string().min(1),
  sessionId: z.string().optional(),
  amount: z.union([z.number(), z.string()]).refine((val) => Number(val) > 0, { message: "סכום חייב להיות חיובי" }),
  expectedAmount: z.union([z.number(), z.string()]).optional(),
  paymentType: z.nativeEnum(PaymentType).default("FULL"),
  method: z.nativeEnum(PaymentMethod).optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  notes: z.string().optional(),
  creditUsed: z.union([z.number(), z.string()]).optional(),
  issueReceipt: z.boolean().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
