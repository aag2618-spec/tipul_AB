import { z } from "zod";
import { SessionType } from "@prisma/client";

export const createSessionSchema = z.object({
  clientId: z.string().optional(),
  startTime: z.string().min(1, "שעת התחלה היא שדה חובה"),
  endTime: z.string().min(1, "שעת סיום היא שדה חובה"),
  type: z.nativeEnum(SessionType).optional(),
  price: z.union([z.number(), z.string()]).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  isRecurring: z.boolean().optional(),
  allowOverlap: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.type !== "BREAK" && !data.clientId) {
      return false;
    }
    return true;
  },
  { message: "נא לבחור מטופל", path: ["clientId"] }
);

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
