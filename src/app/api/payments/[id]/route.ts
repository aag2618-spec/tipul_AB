import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { addPartialPayment, markFullyPaid } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { serializePrisma } from "@/lib/serialize";
import {
  buildPaymentWhere,
  getClientSafeSelectForSecretary,
  getPaymentIncludeForRole,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";

export const dynamic = "force-dynamic";

// Stage 2.0 — Zod schema לעדכון תשלום. PUT מטפל בכמה תרחישים מובחנים
// (prepareCardcom / addPartial / markPaid / simple field update), והעדכון
// היה עד כה ידני עם Number()/string casts פזורים. Zod מבטיח:
//   • amount/creditUsed → numbers חיוביים בלבד (חסום NoSQL operator injection
//     כמו {amount:{$gt:0}} שיגרום ל-Prisma לזרוק ולהדליף סכימה).
//   • method → enum סגור (מונע "DROP TABLE" וכד' להגיע ל-DB columns).
//   • status → enum צר של ערכים ש-PUT באמת מטפל בהם (PAID / PENDING / FAILED).
//   • notes → bounded length (DoS guard).
//   • prepareCardcom / issueReceipt — booleans בלבד.
// כל השדות אופציונליים — PUT semantics.
const UpdatePaymentSchema = z.object({
  amount: z.number().positive().max(1_000_000).optional(),
  creditUsed: z.number().min(0).max(1_000_000).optional(),
  method: z
    .enum(["CASH", "CREDIT_CARD", "BANK_TRANSFER", "CHECK", "CREDIT", "OTHER"])
    .optional(),
  status: z.enum(["PAID", "PENDING", "CANCELLED", "REFUNDED"]).optional(),
  notes: z.string().max(20_000).optional().nullable(),
  issueReceipt: z.boolean().optional(),
  prepareCardcom: z.boolean().optional(),
  paymentMode: z.enum(["FULL", "PARTIAL"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);
    const paymentWhere = buildPaymentWhere(scopeUser);

    // include role-aware: למזכירה חושפים שדות אדמיניסטרטיביים בלבד —
    // ללא session.notes, session.topic, וללא סיבות ביטול (תוכן קליני).
    // Client נטען דרך safe-select הקיים שמסיר notes/intakeNotes וכו'.
    const secretaryInclude = {
      client: { select: getClientSafeSelectForSecretary() },
      session: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          type: true,
          status: true,
          price: true,
        },
      },
    } as const;
    const fullInclude = { client: true, session: true } as const;

    const payment = await prisma.payment.findFirst({
      where: { AND: [{ id }, paymentWhere] },
      include: isSecretary(scopeUser) ? secretaryInclude : fullInclude,
    });

    if (!payment) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    // Child-receipt fallback — בתשלום חלקי/מצטבר הקבלה מונפקת על ה-child,
    // בעוד שה-GET הזה מחזיר את ה-parent. כש-ReceiptPreviewDialog עושה polling
    // לפי id ההורה (כי זה ה-id שה-API מחזיר ל-UI), בלי המיזוג הזה הוא לא
    // מוצא receiptUrl/receiptNumber → "לא נמצאה קבלה". חושפים את קבלת ה-child
    // האחרון שיש לו קבלה. תואם ל-paid-history/dashboard.
    let withReceipt: typeof payment = payment;
    if (!payment.hasReceipt) {
      const childWithReceipt = await prisma.payment.findFirst({
        where: { parentPaymentId: payment.id, hasReceipt: true },
        orderBy: { createdAt: "desc" },
        select: { hasReceipt: true, receiptUrl: true, receiptNumber: true },
      });
      if (childWithReceipt) {
        withReceipt = {
          ...payment,
          hasReceipt: childWithReceipt.hasReceipt,
          receiptUrl: payment.receiptUrl ?? childWithReceipt.receiptUrl,
          receiptNumber: payment.receiptNumber ?? childWithReceipt.receiptNumber,
        };
      }
    }

    return NextResponse.json(serializePrisma(withReceipt));
  } catch (error) {
    logger.error("Get payment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת התשלום" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 });
    }

    // Stage 2.0 — Zod validation. דוחה body עם types/values לא תקינים לפני
    // שהשדות מגיעים ל-Prisma או ל-payment-service.
    const parsed = UpdatePaymentSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          message: firstIssue?.message ?? "נתונים לא תקינים",
          field: firstIssue?.path.join(".") ?? null,
        },
        { status: 400 }
      );
    }
    const { status, method, notes, amount, creditUsed, issueReceipt, prepareCardcom, paymentMode } = parsed.data;

    const scopeUser = await loadScopeUser(userId);
    const paymentWhere = buildPaymentWhere(scopeUser);

    // עדכון תשלום ע"י מזכירה דורש canViewPayments — שינוי תשלום מחייב צפייה.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
      return NextResponse.json(
        { message: "אין הרשאה לצפייה/עדכון תשלומים" },
        { status: 403 }
      );
    }

    // הוצאת קבלה אצל מזכירה — דורשת canIssueReceipts.
    if (
      issueReceipt &&
      isSecretary(scopeUser) &&
      !secretaryCan(scopeUser, "canIssueReceipts")
    ) {
      return NextResponse.json(
        { message: "אין הרשאה להוצאת קבלות" },
        { status: 403 }
      );
    }

    // ── prepareCardcom flow ────────────────────────────────────
    // עדכון מקדים של תשלום קיים לפני פתיחת ChargeCardcomDialog: מעדכן את
    // השדות `amount` ו-`method` בלבד, ללא טריגר ל-addPartialPayment שיוצר
    // ילד "PAID". הסטטוס נשאר PENDING — webhook של Cardcom יעדכן ל-PAID
    // לאחר הסליקה האמיתית.
    //
    // מותר רק על תשלום PENDING של המטפל המחובר. לא נוגעים ב-children
    // ולא יוצרים אודיט מורכב — זה מצב מעבר בלבד.
    if (prepareCardcom === true) {
      const desired = Number(amount);
      if (!Number.isFinite(desired) || desired <= 0) {
        return NextResponse.json({ message: "סכום לא תקין" }, { status: 400 });
      }
      const existing = await prisma.payment.findFirst({
        where: { AND: [{ id }, paymentWhere] },
        select: {
          id: true,
          status: true,
          expectedAmount: true,
          amount: true,
          clientId: true,
          sessionId: true,
          notes: true,
          organizationId: true,
          method: true,
          parentPaymentId: true,
        },
      });
      if (!existing) {
        return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
      }
      if (existing.status !== "PENDING") {
        return NextResponse.json(
          { message: "אפשר להכין לסליקה רק תשלום PENDING" },
          { status: 409 }
        );
      }
      // ── NO-OP: כבר מוכן לסליקה ───────────────────────────────────
      // ה-Payment כבר נוצר עם method=CREDIT_CARD והסכום הנכון
      // (למשל ע״י createPaymentForSession ב-update-session-dialog flow,
      // או ע״י prepareCardcom additive mode שיצר child). אין צורך
      // לעדכן שוב — מחזירים את ה-Payment כפי שהוא, וה-flow ימשיך לסליקה.
      if (
        existing.method === "CREDIT_CARD" &&
        Math.abs(Number(existing.amount) - Number(amount)) < 0.001
      ) {
        // ⚠️ מיסוך PHI — include role-aware (safe-select למזכירה). ראה
        // POST /api/payments. בלי זה decryptDeep מחזיר תוכן קליני למזכירה.
        const updated = await prisma.payment.findUnique({
          where: { id },
          include: getPaymentIncludeForRole(scopeUser),
        });
        return NextResponse.json(serializePrisma(updated));
      }
      const expected = Number(existing.expectedAmount) || 0;
      if (expected <= 0) {
        return NextResponse.json(
          {
            message:
              "תשלום ללא סכום מצופה (expectedAmount=0) לא נתמך לסליקת אשראי. צור תשלום חדש עם סכום מוגדר.",
          },
          { status: 409 }
        );
      }
      const currentAmount = Number(existing.amount) || 0;
      const remaining = expected - currentAmount;
      if (remaining < -0.001) {
        return NextResponse.json(
          { message: `התשלום כבר שולם (סה"כ ₪${currentAmount} מתוך ₪${expected})` },
          { status: 409 }
        );
      }
      const maxChargeable = Math.max(0, remaining);
      if (desired > maxChargeable + 0.001) {
        return NextResponse.json(
          { message: `סכום החיוב (₪${desired}) חורג מהיתרה לתשלום (₪${maxChargeable})` },
          { status: 400 }
        );
      }

      // ── ADDITIVE mode (השלמת חוב חלקי באשראי) ──────────────────
      // אם כבר נצברו תשלומים על החוב (currentAmount > 0), אסור לדרוס את
      // payment.amount כי זה ימחק את ההיסטוריה. במקום, יוצרים child
      // Payment חדש שייצג את חיוב האשראי. ה-charge-cardcom והעובדה ש-
      // ה-webhook יסמן את ה-child כ-PAID + יעדכן את ה-parent דרך
      // bumpParentOnChildApproval (ראה webhooks/cardcom/user/route.ts).
      if (currentAmount > 0) {
        // ⚠️ Serializable: בדיקת in-flight + יצירת child חייבים להיות
        // אטומיים. בלי זה, שני prepareCardcom מקבילים ייצרו 2 children
        // PENDING — שניהם יסלקו, והתשלום יחויב כפול.
        try {
          const child = await prisma.$transaction(
            async (tx) => {
              const inFlightChildTx = await tx.cardcomTransaction.findFirst({
                where: {
                  payment: { parentPaymentId: id },
                  tenant: "USER",
                  status: { in: ["PENDING", "APPROVED"] },
                },
                select: { id: true, paymentId: true, status: true },
              });
              if (inFlightChildTx) {
                throw new Error(
                  inFlightChildTx.status === "APPROVED"
                    ? "ALREADY_APPROVED"
                    : "CHARGE_IN_PROGRESS"
                );
              }
              // אין include כאן — את ה-client/session הממוסכים טוענים אחרי
              // ה-tx דרך re-fetch role-aware (ראה למטה), כדי לא להחזיר PHI
              // למזכירה. משתמשים רק ב-child.id.
              return tx.payment.create({
                data: {
                  parentPaymentId: id,
                  clientId: existing.clientId,
                  // sessionId @unique — לא מעתיקים מ-parent.
                  amount: desired,
                  expectedAmount: desired,
                  method: "CREDIT_CARD",
                  status: "PENDING",
                  paymentType: "PARTIAL",
                  notes: existing.notes,
                  organizationId: existing.organizationId,
                },
              });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
          );
          // ⚠️ מיסוך PHI — re-fetch עם include role-aware (safe-select
          // למזכירה) לפני ההחזרה. ה-child נוצר ב-tx בלי relations; כאן
          // טוענים client/session ממוסכים. ראה POST /api/payments.
          const maskedChild = await prisma.payment.findUnique({
            where: { id: child.id },
            include: getPaymentIncludeForRole(scopeUser),
          });
          return NextResponse.json(
            serializePrisma({ ...maskedChild, _additiveCompletion: true })
          );
        } catch (txErr) {
          const msg = txErr instanceof Error ? txErr.message : String(txErr);
          if (msg === "ALREADY_APPROVED") {
            return NextResponse.json(
              { message: "תשלום השלמה כבר אושר — נסי לרענן." },
              { status: 409 }
            );
          }
          if (msg === "CHARGE_IN_PROGRESS") {
            return NextResponse.json(
              {
                message:
                  "כבר קיים חיוב פתוח להשלמת תשלום זה. בטלי אותו לפני הכנה מחדש.",
              },
              { status: 409 }
            );
          }
          if (
            txErr instanceof Prisma.PrismaClientKnownRequestError &&
            (txErr.code === "P2034" || txErr.code === "40001")
          ) {
            return NextResponse.json(
              { message: "המערכת עמוסה — נסי שוב בעוד רגע" },
              { status: 503 }
            );
          }
          throw txErr;
        }
      }

      // ── REPLACE mode (חוב טרי, אין תשלומים מצטברים) ────────────
      // הגנה: אם כבר קיים CardcomTransaction PENDING/APPROVED על
      // ה-Payment הזה, אסור לשנות את הסכום מתחת לרגליו של חיוב פעיל.
      const inFlightTx = await prisma.cardcomTransaction.findFirst({
        where: {
          paymentId: id,
          tenant: "USER",
          status: { in: ["PENDING", "APPROVED"] },
        },
        select: { id: true, status: true },
      });
      if (inFlightTx) {
        return NextResponse.json(
          {
            message:
              inFlightTx.status === "APPROVED"
                ? "התשלום כבר שולם"
                : "כבר קיים חיוב פתוח לתשלום זה. בטלי אותו לפני הכנה מחדש.",
          },
          { status: 409 }
        );
      }
      // Atomic update — ownership נבדק ב-WHERE, מונע race condition.
      // paymentType — לפי המצב הנוכחי: PARTIAL אם desired<expected (חיוב
      // חלקי על חוב טרי, ה-webhook ישאיר PENDING), אחרת FULL.
      const isPartialPayment =
        paymentMode === "PARTIAL" || desired < expected - 0.001;
      const updateResult = await prisma.payment.updateMany({
        where: { AND: [{ id }, paymentWhere, { status: "PENDING" }] },
        data: {
          amount: desired,
          method: "CREDIT_CARD",
          paymentType: isPartialPayment ? "PARTIAL" : "FULL",
        },
      });
      if (updateResult.count === 0) {
        return NextResponse.json(
          { message: "תשלום לא נמצא או שהסטטוס שונה" },
          { status: 404 }
        );
      }
      // ⚠️ מיסוך PHI — include role-aware (safe-select למזכירה). ראה
      // POST /api/payments. בלי זה decryptDeep מחזיר תוכן קליני למזכירה.
      const updated = await prisma.payment.findUnique({
        where: { id },
        include: getPaymentIncludeForRole(scopeUser),
      });
      return NextResponse.json(serializePrisma(updated));
    }

    // Adding a payment amount (partial or completing)
    if (amount !== undefined) {
      // ⚠️ userId לקבלות חייב להיות של המטפל (בעל החיוב), לא של המבצע
      // (כשמזכירה פועלת בשם המטפל). נטען את התשלום כדי לזהות את המטפל.
      const ownerLookup = await prisma.payment.findFirst({
        where: { id, ...buildPaymentWhere(scopeUser) },
        select: { client: { select: { therapistId: true } } },
      });
      const billingUserId = ownerLookup?.client.therapistId ?? userId;
      const result = await addPartialPayment({
        userId: billingUserId,
        parentPaymentId: id,
        amount: Number(amount),
        method: method || "CASH",
        issueReceipt,
        creditUsed: creditUsed ? Number(creditUsed) : undefined,
        scopeUser,
      });

      if (!result.success) {
        return NextResponse.json({ message: result.error }, { status: 400 });
      }

      if (notes !== undefined) {
        // ownership נבדק כבר ב-addPartialPayment service. עוטפים ב-updateMany
        // עם scope ב-WHERE כdefense-in-depth מפני race condition.
        await prisma.payment.updateMany({
          where: { AND: [{ id }, paymentWhere] },
          data: { notes },
        });
      }

      // ⚠️ מיסוך PHI — ה-service מחזיר client/session מלאים (decryptDeep
      // מפענח תוכן קליני מקונן). re-fetch עם include role-aware לפני ההחזרה
      // כדי שמזכירה לא תראה topic/notes/medicalHistory. id הוא ה-parent
      // בשני הזרמים (addPartialPayment / markFullyPaid). ראה POST /api/payments.
      const maskedPayment = await prisma.payment.findUnique({
        where: { id },
        include: getPaymentIncludeForRole(scopeUser),
      });
      return NextResponse.json(serializePrisma({
        ...maskedPayment,
        receiptError: result.receiptError,
        receiptUrl: result.receiptUrl,
        // ראה הערה ב-POST /api/payments — חושפים receiptNumber טרי בלבד
        // (null כשלא הופקה קבלה בקריאה זו) כדי שה-UI לא יציג קבלה ישנה.
        receiptNumber: result.receiptNumber ?? null,
      }));
    }

    // Marking as fully paid (no specific amount)
    if (status === "PAID") {
      const ownerLookupFull = await prisma.payment.findFirst({
        where: { id, ...buildPaymentWhere(scopeUser) },
        select: { client: { select: { therapistId: true } } },
      });
      const billingUserIdFull = ownerLookupFull?.client.therapistId ?? userId;
      const result = await markFullyPaid({
        userId: billingUserIdFull,
        paymentId: id,
        method: method || "CASH",
        issueReceipt,
        creditUsed: creditUsed ? Number(creditUsed) : undefined,
        scopeUser,
      });

      if (!result.success) {
        return NextResponse.json({ message: result.error }, { status: 400 });
      }

      if (notes !== undefined) {
        await prisma.payment.updateMany({
          where: { AND: [{ id }, paymentWhere] },
          data: { notes },
        });
      }

      // ⚠️ מיסוך PHI — ה-service מחזיר client/session מלאים (decryptDeep
      // מפענח תוכן קליני מקונן). re-fetch עם include role-aware לפני ההחזרה
      // כדי שמזכירה לא תראה topic/notes/medicalHistory. id הוא ה-parent
      // בשני הזרמים (addPartialPayment / markFullyPaid). ראה POST /api/payments.
      const maskedPayment = await prisma.payment.findUnique({
        where: { id },
        include: getPaymentIncludeForRole(scopeUser),
      });
      return NextResponse.json(serializePrisma({
        ...maskedPayment,
        receiptError: result.receiptError,
        receiptUrl: result.receiptUrl,
        // ראה הערה ב-POST /api/payments — חושפים receiptNumber טרי בלבד
        // (null כשלא הופקה קבלה בקריאה זו) כדי שה-UI לא יציג קבלה ישנה.
        receiptNumber: result.receiptNumber ?? null,
      }));
    }

    // Simple field update (status change, notes, method — no payment action)
    // Atomic — scope ב-WHERE מונע race condition / IDOR.
    const updateResult = await prisma.payment.updateMany({
      where: { AND: [{ id }, paymentWhere] },
      data: {
        status: status || undefined,
        method: method || undefined,
        notes: notes !== undefined ? notes : undefined,
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
    }

    // include client + session לשמור על תאימות עם ה-frontend.
    // ⚠️ מיסוך PHI — include role-aware (safe-select למזכירה). ראה
    // POST /api/payments. בלי זה decryptDeep מחזיר תוכן קליני למזכירה.
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: getPaymentIncludeForRole(scopeUser),
    });
    return NextResponse.json(serializePrisma(payment));
  } catch (error) {
    logger.error("Update payment error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בעדכון התשלום" },
      { status: 500 }
    );
  }
}

