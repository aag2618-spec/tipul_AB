import { z } from "zod";
import { NextResponse } from "next/server";

export async function parseBody<T>(request: Request, schema: z.ZodSchema<T>): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return { error: NextResponse.json({ message: "נתונים לא תקינים", errors: result.error.flatten().fieldErrors }, { status: 400 }) };
    }
    return { data: result.data };
  } catch {
    return { error: NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 }) };
  }
}

// H12: זהיר עם זה — חלק מה-endpoints מחזירים שדה שונה (`error` במקום `message`).
// בלי overload, parseBody תמיד תחזיר { message }. עבור endpoints שמעדיפים `error`,
// יש להשתמש ב-parseBodyWithErrorField מתחת.
export async function parseBodyWithErrorField<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      // הודעה ראשונה — תואם ל-UI שלא בודק errors{}.
      const firstMessage =
        Object.values(fieldErrors).flat().filter(Boolean)[0] || "נתונים לא תקינים";
      return {
        error: NextResponse.json(
          { error: firstMessage, errors: fieldErrors },
          { status: 400 }
        ),
      };
    }
    return { data: result.data };
  } catch {
    return { error: NextResponse.json({ error: "גוף הבקשה לא תקין" }, { status: 400 }) };
  }
}

/**
 * parseOptionalBody — גרסת parseBody לנתיבים שבהם ה-UI עשוי לקרוא ללא body
 * (למשל כפתור "פעולה" שלא שולח body). אם הגוף ריק או לא תקין, מתפרש כ-{}
 * וה-schema מאומת מולו. שימושי רק לסכמות שכל השדות שלהן optional.
 */
export async function parseOptionalBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      error: NextResponse.json(
        { message: "נתונים לא תקינים", errors: result.error.flatten().fieldErrors },
        { status: 400 }
      ),
    };
  }
  return { data: result.data };
}

/**
 * Search-params parser — עוטף URLSearchParams ב-zod. שימושי ל-GET endpoints
 * שמקבלים query params (date, status, etc.) ולא body.
 */
export function parseSearchParams<T>(
  url: string,
  schema: z.ZodSchema<T>
): { data: T } | { error: NextResponse } {
  try {
    const params = Object.fromEntries(new URL(url).searchParams.entries());
    const result = schema.safeParse(params);
    if (!result.success) {
      return {
        error: NextResponse.json(
          { message: "פרמטרים לא תקינים", errors: result.error.flatten().fieldErrors },
          { status: 400 }
        ),
      };
    }
    return { data: result.data };
  } catch {
    return { error: NextResponse.json({ message: "URL לא תקין" }, { status: 400 }) };
  }
}
