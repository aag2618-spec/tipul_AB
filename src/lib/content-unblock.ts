import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * שער כלי "שחרור תיק חסום": מאמת בצד שרת שהמשתמש/ת הדליק/ה את מצב "סינון תוכן"
 * (usesContentFilter). מחזיר NextResponse(403) אם כבוי, או null אם מותר.
 *
 * הגנה זו נוספת על הסתרת הטאב ב-UI ועל ה-notFound בדף — כלי מחיקה הרסני
 * (לצמיתות) לא ייחשף ולא יפעל בלי הפעלה מפורשת של המשתמש/ת.
 */
export async function requireContentFilterEnabled(
  userId: string
): Promise<NextResponse | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { usesContentFilter: true },
  });
  if (!u?.usesContentFilter) {
    return NextResponse.json(
      { message: "הכלי אינו פעיל. יש להפעיל 'סינון תוכן' בהגדרות ← אבטחה." },
      { status: 403 }
    );
  }
  return null;
}
