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
