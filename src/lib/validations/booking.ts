// H12: booking POST schema — public endpoint, מקבל קלט מבקר אנונימי.
//
// זהירות: ה-route.ts המורכב משתמש ב-regex ספציפיים (NAME_RE עם גרשיים חרדיים,
// PHONE_DIGITS_RE לנרמול ישראלי, SUSPICIOUS_NAME_PATTERNS). zod כאן מבצע רק
// type+size validation בשלב הראשון. הנרמול והבדיקות הסמנטיות נשארות ב-route.

import { z } from "zod";

export const bookingPostSchema = z.object({
  // type-checks חלשים יחסית — הregex הקיים ב-route מטפל בפורמט המדויק.
  date: z.string().min(1, "תאריך חובה").max(20),
  time: z.string().min(1, "שעה חובה").max(10),
  clientName: z
    .string()
    .min(1, "שם חובה")
    .max(200, "שם ארוך מדי"),
  clientPhone: z
    .string()
    .max(40, "טלפון ארוך מדי")
    .optional()
    .or(z.literal("")),
  clientEmail: z
    .string()
    .max(254, "מייל ארוך מדי")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .max(1000, "הערות ארוכות מדי (מקסימום 1000 תווים)")
    .optional()
    .or(z.literal("")),
  // honeypot — בני אדם משאירים ריק, בוטים ממלאים. cap מונע flood.
  hp: z.string().max(500).optional().or(z.literal("")),
});

export type BookingPostInput = z.infer<typeof bookingPostSchema>;
