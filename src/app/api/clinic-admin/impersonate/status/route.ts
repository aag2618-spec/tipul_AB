import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — בדיקה אם המשתמש כעת במצב impersonation. משמש ע"י banner ו-debug.
export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { isImpersonating, actingAs, originalUserId } = auth;

  return NextResponse.json({
    isImpersonating,
    actingAs: actingAs ?? null,
    originalUserId: originalUserId ?? null,
  });
}
