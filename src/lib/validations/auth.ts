import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1, "שם הוא שדה חובה"),
  email: z.string().email("כתובת מייל לא תקינה"),
  password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
  phone: z.string().optional(),
  license: z.string().optional(),
  couponCode: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
