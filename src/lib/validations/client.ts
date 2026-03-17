import { z } from "zod";
import { ClientStatus } from "@prisma/client";

export const createClientSchema = z.object({
  firstName: z.string().min(1, "שם פרטי הוא שדה חובה"),
  lastName: z.string().min(1, "שם משפחה הוא שדה חובה"),
  phone: z.string().optional(),
  email: z.string().email("כתובת מייל לא תקינה").optional().or(z.literal("")),
  birthDate: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  defaultSessionPrice: z.union([z.number(), z.string()]).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
