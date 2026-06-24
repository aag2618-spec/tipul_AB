// zod schema לטופס "צרו קשר" הציבורי בדף הנחיתה (POST /api/contact).
// ה-endpoint אנונימי — caps על אורכים = הגנת DoS, ו-website הוא honeypot נסתר
// (בוטים ממלאים אותו; בני אדם לא רואים אותו).

import { z } from "zod";

export const contactLeadSchema = z.object({
  name: z.string().trim().min(2, "נא להזין שם מלא").max(100),
  email: z.string().trim().max(254).email("כתובת מייל לא תקינה"),
  phone: z.string().trim().max(30).optional(),
  organization: z.string().trim().max(150).optional(),
  message: z.string().trim().min(5, "נא לכתוב הודעה קצרה").max(2000),
  // honeypot — חייב להישאר ריק. אם מולא → בוט.
  website: z.string().max(200).optional(),
});

export type ContactLeadInput = z.infer<typeof contactLeadSchema>;
