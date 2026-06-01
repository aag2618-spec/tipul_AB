import { NextResponse } from "next/server";

// ⚠️ הקישור הכללי הפתוח (/booking/[slug]) בוטל לחלוטין.
//
// בעבר זה היה קישור אחד זהה לכל המטופלים — מה שאיפשר לכל אחד (גם מי שלא מטופל
// במערכת) לקבוע תור ולהירשם כמטופל חדש, או לקבוע בשם מייל אחר. הוחלף בקישור
// אישי ומאובטח לכל מטופל: /booking/t/[token] (token 256 ביט + OTP + קשירה
// ל-clientId). ראה src/app/api/booking/t/[token]/route.ts.
//
// ה-route נשאר כ-stub שמחזיר 410 (Gone) כדי שמי שמחזיק קישור כללי ישן יקבל
// הסבר ברור, במקום 404 סתמי. אין כאן יותר GET של שעות או POST שיוצר פגישה.

export const dynamic = "force-dynamic";

const GONE_MESSAGE =
  "הקישור הכללי לקביעת תור בוטל. נא לבקש מהמטפל/ת קישור אישי חדש.";

export async function GET() {
  return NextResponse.json({ message: GONE_MESSAGE, discontinued: true }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ message: GONE_MESSAGE, discontinued: true }, { status: 410 });
}
