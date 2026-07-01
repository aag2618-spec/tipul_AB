// src/app/p/appointments/[token]/page.tsx
// עמוד ציבורי "הפגישות שלי" — קישור אישי (BookingLink token) שנשלח למטופל
// באישור/בתזכורת. בלי התחברות: אימות דרך OTP, ואז רשימת פגישות עם ביטול.
// כל הלוגיקה בצד השרת ב-/api/p/appointments/[token]; זה רק מעטפת client.

import { AppointmentsClient } from "./appointments-client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function AppointmentsPage({ params }: Props) {
  const { token } = await params;
  return <AppointmentsClient token={token} />;
}
