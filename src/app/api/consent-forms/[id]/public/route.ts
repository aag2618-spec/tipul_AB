import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit-logger";
import { checkRateLimit, CONSENT_PUBLIC_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseBody } from "@/lib/validations/helpers";
import { signConsentFormSchema } from "@/lib/validations/consent-form";

export const dynamic = "force-dynamic";

const UNIFORM_DENY = NextResponse.json({ message: "אין הרשאה" }, { status: 403 });

function verifyToken(dbToken: string | null, providedToken: string): boolean {
  if (!dbToken) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(dbToken, "utf8"),
      Buffer.from(providedToken, "utf8")
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`consent-public:${ip}`, CONSENT_PUBLIC_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;
    const token = request.nextUrl.searchParams.get("t");

    if (!token || !/^[0-9a-f]{32}$/.test(token)) {
      return UNIFORM_DENY;
    }

    const form = await prisma.consentForm.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        signedAt: true,
        signToken: true,
        signTokenExpiresAt: true,
        clientId: true,
        client: {
          select: { name: true },
        },
        therapist: {
          select: { name: true, businessName: true },
        },
      },
    });

    if (!form) return UNIFORM_DENY;

    if (!verifyToken(form.signToken, token)) {
      return UNIFORM_DENY;
    }

    if (form.signTokenExpiresAt && form.signTokenExpiresAt < new Date()) {
      return UNIFORM_DENY;
    }

    logDataAccess({
      userId: null,
      recordType: "CONSENT_FORM",
      recordId: id,
      action: "READ",
      clientId: form.clientId,
      request,
      meta: { accessSource: "consent_public_link" },
    });

    return NextResponse.json({
      id: form.id,
      title: form.title,
      content: form.content,
      signedAt: form.signedAt,
      therapistName: form.therapist?.businessName || form.therapist?.name || "",
    });
  } catch (error) {
    logger.error("Public consent form GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`consent-public:${ip}`, CONSENT_PUBLIC_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;
    const token = request.nextUrl.searchParams.get("t");

    if (!token || !/^[0-9a-f]{32}$/.test(token)) {
      return UNIFORM_DENY;
    }

    const parsed = await parseBody(request, signConsentFormSchema);
    if ("error" in parsed) return parsed.error;
    const { signatureData } = parsed.data;

    const form = await prisma.consentForm.findUnique({
      where: { id },
      select: {
        id: true,
        signedAt: true,
        signToken: true,
        signTokenExpiresAt: true,
        clientId: true,
      },
    });

    if (!form) return UNIFORM_DENY;

    if (!verifyToken(form.signToken, token)) {
      return UNIFORM_DENY;
    }

    if (form.signTokenExpiresAt && form.signTokenExpiresAt < new Date()) {
      return UNIFORM_DENY;
    }

    if (form.signedAt) {
      return NextResponse.json(
        { message: "הטופס כבר נחתם" },
        { status: 400 }
      );
    }

    await prisma.consentForm.update({
      where: { id },
      data: {
        signatureData,
        signedAt: new Date(),
        signToken: null,
        signTokenExpiresAt: null,
      },
    });

    logDataAccess({
      userId: null,
      recordType: "CONSENT_FORM",
      recordId: id,
      action: "SIGN",
      clientId: form.clientId,
      request,
      meta: { accessSource: "consent_public_link" },
    });

    return NextResponse.json({ success: true, signedAt: new Date() });
  } catch (error) {
    logger.error("Public consent form PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}
