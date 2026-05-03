import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendEmail } from "@/lib/resend";
import { PLAN_NAMES } from "@/lib/pricing";
import { logger } from "@/lib/logger";
import { getIsraelMidnight } from "@/lib/date-utils";
import { withAudit } from "@/lib/audit";

import { requirePermission, requireHighestPermission } from "@/lib/api-auth";
import type { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Infer audit action name from PATCH/PUT body.
 * Used by withAudit to record a meaningful action code in the audit log.
 */
function inferAuditAction(body: Record<string, unknown>): string {
  if (body.grantFree) return "grant_free";
  if (body.revokeFree) return "revoke_free";
  if (body.extendDays && typeof body.extendDays === "number" && body.extendDays > 0) {
    return "extend_subscription";
  }
  if ("isBlocked" in body) return body.isBlocked ? "block_user" : "unblock_user";
  if ("role" in body) return "change_role";
  if ("aiTier" in body && !("isBlocked" in body)) return "change_tier";
  if ("subscriptionEndsAt" in body) return "change_subscription_end";
  return "update_user";
}

// GET — פרופיל משתמש מלא
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("users.view");
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isBlocked: true,
        blockReason: true,
        blockedAt: true,
        blockedBy: true,
        aiTier: true,
        subscriptionStatus: true,
        subscriptionStartedAt: true,
        subscriptionEndsAt: true,
        trialEndsAt: true,
        isFreeSubscription: true,
        freeSubscriptionNote: true,
        userNumber: true,
        createdAt: true,
        aiUsageStats: {
          select: {
            currentMonthCalls: true,
            currentMonthCost: true,
            totalCalls: true,
            totalCost: true,
            dailyCalls: true,
          },
        },
        _count: {
          select: {
            clients: true,
            therapySessions: true,
            documents: true,
            supportTickets: true,
            apiUsageLogs: true,
          },
        },
        subscriptionPayments: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            amount: true,
            status: true,
            description: true,
            paidAt: true,
            createdAt: true,
          },
        },
        supportTickets: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            ticketNumber: true,
            subject: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    logger.error("Error fetching user profile:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ message: "שגיאה בטעינת פרופיל" }, { status: 500 });
  }
}

/**
 * PUT — עדכון שדות בסיסיים בלבד (name, email, phone, password).
 *
 * שים לב: `role` ו-`aiTier` אינם נקלטים כאן יותר (Stage 1.5 — הקשחה לפי
 * המלצת הסוקר: פחות risk surface, הפרדה ברורה בין PUT בסיסי ל-PATCH עסקי).
 * לשינוי role/aiTier/מנוי — חייב לעבור דרך PATCH.
 *
 * `users.reset_password` אסור על משתמש-יעד שהוא ADMIN (מונע privilege escalation
 * של MANAGER שמאפס סיסמת ADMIN ונכנס במקומו).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, email, password, phone, role, aiTier } = body;

    // === Loud rejection: PUT לא מטפל ב-role/aiTier יותר ===
    // לפני Stage 1.5 ה-PUT קיבל אותם בשקט, וה-UI עשוי עדיין לשלוח.
    // זורקים 400 כדי שהמשתמש יראה מה קורה במקום שיחשוב שזה עבד.
    if (role !== undefined) {
      return NextResponse.json(
        {
          message: "שינוי תפקיד חייב לעבור דרך PATCH (לא PUT)",
          field: "role",
        },
        { status: 400 }
      );
    }
    if (aiTier !== undefined) {
      return NextResponse.json(
        {
          message: "שינוי תוכנית חייב לעבור דרך PATCH (לא PUT)",
          field: "aiTier",
        },
        { status: 400 }
      );
    }

    // בחירת ההרשאה לפי תוכן הבקשה
    const required: Permission[] = ["users.update_basic"];
    if (password) required.push("users.reset_password");

    const auth = await requireHighestPermission(required);
    if ("error" in auth) return auth.error;
    const { session } = auth;
    const isAdmin = session.user.role === "ADMIN";

    // === Input validation ===
    if (email !== undefined) {
      if (typeof email !== "string" || !email.includes("@")) {
        return NextResponse.json(
          { message: "כתובת מייל לא תקינה", field: "email" },
          { status: 400 }
        );
      }
    }
    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 8) {
        return NextResponse.json(
          { message: "סיסמה חייבת להיות באורך 8 תווים לפחות", field: "password" },
          { status: 400 }
        );
      }
    }

    // === Guard על משתמשים שיעדם ADMIN ===
    // מזכיר אסור:
    //   (1) לאפס סיסמת ADMIN (הנחת טרויאנית של שומר סיסמה)
    //   (2) לשנות email של ADMIN (vector של password-reset-via-email-swap)
    //   (3) לשנות name/phone של ADMIN (vector של SMS reset אם יהיה)
    const touchesProtectedField =
      password !== undefined ||
      email !== undefined ||
      name !== undefined ||
      phone !== undefined;
    if (touchesProtectedField && !isAdmin) {
      const target = await prisma.user.findUnique({
        where: { id },
        select: { role: true },
      });
      if (target?.role === "ADMIN") {
        return NextResponse.json(
          { message: "מזכיר לא יכול לשנות פרטים של מנהל" },
          { status: 403 }
        );
      }
    }

    // Build update data — שדות בסיסיים בלבד
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = (email as string).toLowerCase().trim();
    if (phone !== undefined) updateData.phone = phone;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    // עטיפה ב-withAudit — רישום ב-audit log אטומית עם העדכון
    const auditDetails = {
      changes: Object.keys(updateData).filter((k) => k !== "password"),
      passwordReset: Boolean(password),
    };
    const updatedUser = await withAudit(
      { kind: "user", session },
      {
        action: password ? "reset_password" : "update_user_basic",
        targetType: "user",
        targetId: id,
        details: auditDetails,
      },
      async (tx) => {
        return tx.user.update({
          where: { id },
          data: updateData,
        });
      }
    );

    return NextResponse.json({
      message: "המשתמש עודכן בהצלחה",
      user: { ...updatedUser, password: undefined },
    });
  } catch (error) {
    logger.error('Error updating user:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעדכון המשתמש" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("users.delete");
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    // Prevent deleting self
    if (id === userId) {
      return NextResponse.json(
        { message: "אי אפשר למחוק את עצמך" },
        { status: 400 }
      );
    }

    // Snapshot לפני מחיקה — כדי שיהיה תיעוד גם אחרי שהמשתמש כבר לא קיים
    const userSnapshot = await prisma.user.findUnique({
      where: { id },
      select: { email: true, name: true, role: true, userNumber: true },
    });

    // מחיקה + audit log כיחידה אטומית
    await withAudit(
      { kind: "user", session },
      {
        action: "delete_user",
        targetType: "user",
        targetId: id,
        details: {
          deletedUserSnapshot: userSnapshot,
        },
      },
      async (tx) => {
        return tx.user.delete({ where: { id } });
      }
    );

    return NextResponse.json({
      message: "המשתמש נמחק בהצלחה"
    });
  } catch (error) {
    logger.error('Error deleting user:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה במחיקת המשתמש" },
      { status: 500 }
    );
  }
}

/**
 * PATCH — פעולות עסקיות על מנוי משתמש.
 *
 * Stage 1.4-1.5:
 * - Collect+max permission pattern: כל שדה ב-body מייצר הרשאה נדרשת,
 *   ומחפשים את הגבוהה מביניהן. תומך ב-combos מכוונים מה-UI (handleGrantFree).
 * - אכיפה מספרית ב-handler: MANAGER מוגבל ל-extendDays ≤14, grantFree ≤30d,
 *   subscriptionEndsAt ישיר ≤30d קדימה, ו-`null` אסור למזכיר.
 * - Race fix ב-extendDays: transaction + SELECT FOR UPDATE מונע
 *   שני מזכירים שמוסיפים 7 ימים במקביל ומאבדים הארכה.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      isBlocked, blockReason, aiTier, subscriptionStatus, subscriptionEndsAt, extendDays,
      grantFree, revokeFree, freeNote, role,
    } = body;

    const VALID_BLOCK_REASONS = ["DEBT", "TOS_VIOLATION", "MANUAL"] as const;
    type ValidBlockReason = typeof VALID_BLOCK_REASONS[number];

    // === Collect+max permissions ===
    const required: Permission[] = [];
    if (role !== undefined) required.push("users.change_role"); // ADMIN only

    if (grantFree) {
      // days-cap לפי subscriptionEndsAt (אם null = unlimited)
      const daysGranted =
        subscriptionEndsAt
          ? Math.ceil(
              (getIsraelMidnight(new Date(subscriptionEndsAt)).getTime() -
                getIsraelMidnight(new Date()).getTime()) / 86400000
            )
          : Infinity;
      required.push(
        daysGranted > 30
          ? "users.grant_free_unlimited"
          : "users.grant_free_30d"
      );
    }

    if (revokeFree) required.push("users.revoke_free");
    if (isBlocked !== undefined) required.push("users.block");
    if (extendDays && extendDays > 0) required.push("users.extend_trial_14d");

    // שינוי tier / תאריך תפוגה / סטטוס ללא grantFree/revokeFree
    if (
      !grantFree &&
      !revokeFree &&
      (aiTier !== undefined ||
        subscriptionEndsAt !== undefined ||
        subscriptionStatus !== undefined)
    ) {
      required.push("users.change_tier");
    }

    if (required.length === 0) required.push("users.update_basic");

    const auth = await requireHighestPermission(required);
    if ("error" in auth) return auth.error;
    const { session } = auth;
    const isAdmin = session.user.role === "ADMIN";

    // === ולידציית blockReason — אחרי authorization כדי לא להדליף schema ===
    // אם חוסמים — חייבים לציין סיבה תקפה (DEBT/TOS_VIOLATION/MANUAL).
    // המגבלה דרושה כדי שה-webhooks (auto-unblock) ידעו אם מותר לשחרר את
    // המשתמש אוטומטית בתשלום: רק DEBT — לא TOS/MANUAL.
    if (isBlocked === true) {
      if (!blockReason || !VALID_BLOCK_REASONS.includes(blockReason as ValidBlockReason)) {
        return NextResponse.json(
          { message: "חובה לציין סיבת חסימה תקפה: DEBT / TOS_VIOLATION / MANUAL" },
          { status: 400 }
        );
      }
      // MANAGER מוגבל ל-DEBT בלבד. TOS_VIOLATION חמור משמעתית; MANUAL יוצר
      // חסימה דביקה שלא משתחררת אוטומטית — שתיהן דורשות ADMIN שפיט.
      if (!isAdmin && blockReason !== "DEBT") {
        return NextResponse.json(
          {
            message:
              "מזכיר יכול לחסום רק על חוב פתוח (DEBT). חסימת ToS/ידנית דורשת אדמין",
          },
          { status: 403 }
        );
      }
    }

    // === אכיפה מספרית (לא ב-permission — ב-handler!) ===
    // MANAGER עם extendDays > 14 → 403
    if (extendDays && extendDays > 14 && !isAdmin) {
      return NextResponse.json(
        { message: "מזכיר יכול להאריך ניסיון עד 14 יום בלבד" },
        { status: 403 }
      );
    }

    // סתירה הגיונית: extendDays + subscriptionEndsAt ללא grantFree — לא ברור מה מנצח.
    // extendDays מוסיף ימים מהתפוגה הנוכחית; subscriptionEndsAt קובע תאריך מפורש.
    // UX לא עקבי; דורשים מה-UI לבחור אחד.
    if (extendDays && subscriptionEndsAt !== undefined && !grantFree) {
      return NextResponse.json(
        {
          message:
            "שלח רק אחד: extendDays או subscriptionEndsAt, לא את שניהם",
        },
        { status: 400 }
      );
    }

    // Back-door closure: MANAGER עם subscriptionEndsAt ישיר (בלי grantFree)
    if (subscriptionEndsAt !== undefined && !grantFree) {
      // null = הסרת תאריך תפוגה = unlimited → ADMIN בלבד
      if (subscriptionEndsAt === null && !isAdmin) {
        return NextResponse.json(
          { message: "מזכיר לא יכול להסיר תאריך תפוגה" },
          { status: 403 }
        );
      }
      // > 30 יום קדימה → ADMIN בלבד
      if (subscriptionEndsAt !== null) {
        const days = Math.ceil(
          (getIsraelMidnight(new Date(subscriptionEndsAt)).getTime() -
            getIsraelMidnight(new Date()).getTime()) / 86400000
        );
        if (days > 30 && !isAdmin) {
          return NextResponse.json(
            { message: "מזכיר יכול להאריך מנוי עד 30 יום קדימה בלבד" },
            { status: 403 }
          );
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (isBlocked !== undefined) {
      updateData.isBlocked = isBlocked;
      if (isBlocked === true) {
        // חסימה — שומרים את הסיבה, מי חסם ומתי. blockedBy=null אם נחסם
        // אוטומטית (לא ע"י אדמין), אבל כאן אנחנו תמיד תחת session של אדמין.
        updateData.blockReason = blockReason;
        updateData.blockedAt = new Date();
        updateData.blockedBy = session.user.id;
      } else {
        // שחרור — מנקים את כל המטא-דאטה כדי לא להשאיר רשומה מטעה.
        updateData.blockReason = null;
        updateData.blockedAt = null;
        updateData.blockedBy = null;
      }
    }
    if (aiTier !== undefined) updateData.aiTier = aiTier;
    if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus;
    if (role !== undefined) updateData.role = role;

    // ========================================
    // מנוי חינם - הענקה
    // ========================================
    if (grantFree) {
      updateData.isFreeSubscription = true;
      updateData.freeSubscriptionNote = freeNote || null;
      updateData.freeSubscriptionGrantedAt = new Date();
      updateData.subscriptionStatus = "ACTIVE";
      updateData.subscriptionStartedAt = new Date();
    }

    // ========================================
    // מנוי חינם - ביטול (מעבר לתשלום)
    // ========================================
    if (revokeFree) {
      updateData.isFreeSubscription = false;
      updateData.freeSubscriptionNote = null;
      updateData.subscriptionStatus = "CANCELLED";
      // נותנים 7 ימים לשלם (תקופת חסד) - לא משאירים את כל התקופה החינמית!
      updateData.subscriptionEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    // תאריך תפוגה ספציפי — חייב להיות לפני ה-update כדי שיאוחד עם שאר השדות
    if (subscriptionEndsAt !== undefined) {
      updateData.subscriptionEndsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
    }

    // עטיפה ב-withAudit — יוצרת transaction Serializable + retry על 40001/40P01
    // ורישום ב-AdminAuditLog כיחידה אטומית עם העדכון.
    // הערה: withAudit מספקת transaction בעצמה — אין צורך ב-$transaction נוסף.
    // Race-safe extension: SELECT FOR UPDATE בתוך ה-transaction של withAudit;
    // שני מזכירים שמוסיפים ימים במקביל → Postgres נועל את השורה.
    // סדר עדיפות: אם גם extendDays וגם subscriptionEndsAt נשלחו — extendDays זוכה
    // (הוא מוסיף ימים לתפוגה הנוכחית ב-DB, לא לערך מה-body).
    const updatedUser = await withAudit(
      { kind: "user", session },
      {
        action: inferAuditAction(body),
        targetType: "user",
        targetId: id,
        details: {
          changes: Object.keys(updateData),
          extendDays: extendDays || undefined,
          grantFree: grantFree || undefined,
          revokeFree: revokeFree || undefined,
          freeNote: grantFree ? freeNote || null : undefined,
        },
      },
      async (tx) => {
        if (extendDays && typeof extendDays === "number" && extendDays > 0) {
          await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${id} FOR UPDATE`;
          const currentUser = await tx.user.findUnique({
            where: { id },
            select: { subscriptionEndsAt: true },
          });
          const baseDate =
            currentUser?.subscriptionEndsAt &&
            new Date(currentUser.subscriptionEndsAt) > new Date()
              ? new Date(currentUser.subscriptionEndsAt)
              : new Date();
          updateData.subscriptionEndsAt = new Date(
            baseDate.getTime() + extendDays * 24 * 60 * 60 * 1000
          );
        }
        return tx.user.update({
          where: { id },
          data: updateData,
        });
      }
    );

    const SYSTEM_URL = process.env.NEXTAUTH_URL || "";

    // ========================================
    // מייל כשנותנים מנוי חינם
    // ========================================
    if (grantFree && updatedUser.email) {
      const tierName = PLAN_NAMES[updatedUser.aiTier] || updatedUser.aiTier;
      await sendEmail({
        to: updatedUser.email,
        subject: `מנוי ${tierName} הופעל עבורך!`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">🎉 המנוי שלך הופעל!</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #333; margin-top: 0;">שלום ${updatedUser.name || ""},</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                קיבלת גישה למסלול <strong>${tierName}</strong> ללא חיוב.
              </p>
              <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #166534;">✅ המנוי פעיל - תהנה מכל היכולות!</p>
              </div>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${SYSTEM_URL}/dashboard" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  כניסה למערכת
                </a>
              </div>
            </div>
          </div>
        `,
      }).catch(err => logger.error("Grant free email failed:", { error: err instanceof Error ? err.message : String(err) }));
    }

    // ========================================
    // מייל כשחוסמים משתמש (הסבר במקום רק redirect)
    // ========================================
    if (isBlocked === true && updatedUser.email) {
      await sendEmail({
        to: updatedUser.email,
        subject: "החשבון שלך נחסם",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: #dc2626; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">החשבון שלך נחסם</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #333; margin-top: 0;">שלום ${updatedUser.name || ""},</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                החשבון שלך נחסם על ידי מנהל המערכת.
              </p>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                אם אתה חושב שזו טעות או שאתה רוצה לברר את הסיבה — אנא פנה אלינו בתשובה למייל הזה.
              </p>
              <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #991b1b;">
                  הנתונים שלך נשמרים ומאובטחים. גישה למערכת תוחזר אחרי בירור.
                </p>
              </div>
            </div>
          </div>
        `,
      }).catch((err) =>
        logger.error("Block user email failed:", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    // ========================================
    // מייל כשמבטלים חסימה (שחרור)
    // ========================================
    if (isBlocked === false && updatedUser.email) {
      await sendEmail({
        to: updatedUser.email,
        subject: "החשבון שלך שוחרר",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: #10b981; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">החשבון שלך הופעל מחדש</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #333; margin-top: 0;">שלום ${updatedUser.name || ""},</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                החסימה על החשבון שלך הוסרה. אפשר להתחבר שוב למערכת.
              </p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${SYSTEM_URL}/login" style="display: inline-block; background: #10b981; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  כניסה למערכת
                </a>
              </div>
            </div>
          </div>
        `,
      }).catch((err) =>
        logger.error("Unblock user email failed:", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    // ========================================
    // מייל כשמבטלים מנוי חינם (עם קישור לתשלום)
    // ========================================
    if (revokeFree && updatedUser.email) {
      const tierName = PLAN_NAMES[updatedUser.aiTier] || updatedUser.aiTier;
      const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;
      await sendEmail({
        to: updatedUser.email,
        subject: "המנוי החינמי שלך הסתיים - המשך עם מנוי בתשלום",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: #f59e0b; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">תקופת המנוי החינמי הסתיימה</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #333; margin-top: 0;">שלום ${updatedUser.name || ""},</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                תקופת המנוי החינמי שלך במסלול <strong>${tierName}</strong> הסתיימה.
              </p>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                כדי להמשיך להשתמש בכל היכולות, בחר מסלול מנוי מתאים:
              </p>
              <div style="background: #f0f9ff; border: 1px solid #7dd3fc; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px; color: #075985; font-weight: bold;">מה כלול?</p>
                <p style="margin: 0; color: #075985;">✅ ניהול מטופלים ויומן</p>
                <p style="margin: 0; color: #075985;">✅ תשלומים וקבלות</p>
                <p style="margin: 0; color: #075985;">✅ AI עוזר חכם</p>
                <p style="margin: 0; color: #075985;">✅ כל הנתונים שלך שמורים!</p>
              </div>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                  בחר מסלול והמשך ▸
                </a>
              </div>
              <p style="color: #999; font-size: 13px; text-align: center;">
                הנתונים שלך שמורים ומאובטחים. תוכל לגשת אליהם מחדש מיד אחרי הרכישה.
              </p>
            </div>
          </div>
        `,
      }).catch(err => logger.error("Revoke free email failed:", { error: err instanceof Error ? err.message : String(err) }));
    }

    return NextResponse.json({
      message: "עודכן בהצלחה",
      user: updatedUser
    });
  } catch (error) {
    logger.error('Error updating user:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעדכון המשתמש" },
      { status: 500 }
    );
  }
}
