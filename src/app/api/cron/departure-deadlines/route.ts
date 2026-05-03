import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { checkCronAuth } from "@/lib/cron-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const SYSTEM_URL = process.env.NEXTAUTH_URL || "https://your-app.onrender.com";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// העברת תיק קליני: מעתיקים רק שדות לא-כספיים. creditBalance/defaultSessionPrice
// מאופסים. פגישות, תשלומים, קבלות נשארים בקליניקה הנוכחית (היסטוריה).
async function cloneClinicalFile(
  tx: Parameters<Parameters<typeof withAudit>[2]>[0],
  originalClientId: string,
  newTherapistId: string
): Promise<string> {
  const orig = await tx.client.findUnique({
    where: { id: originalClientId },
    select: {
      firstName: true,
      lastName: true,
      name: true,
      phone: true,
      email: true,
      birthDate: true,
      address: true,
      status: true,
      medicalHistory: true,
      notes: true,
      initialDiagnosis: true,
      intakeNotes: true,
      therapeuticApproaches: true,
      approachNotes: true,
      culturalContext: true,
      comprehensiveAnalysis: true,
      comprehensiveAnalysisAt: true,
    },
  });

  if (!orig) throw new Error(`Original client ${originalClientId} not found`);

  const cloned = await tx.client.create({
    data: {
      firstName: orig.firstName,
      lastName: orig.lastName,
      name: orig.name,
      phone: orig.phone,
      email: orig.email,
      birthDate: orig.birthDate,
      address: orig.address,
      status: orig.status,
      medicalHistory: orig.medicalHistory ?? undefined,
      notes: orig.notes,
      initialDiagnosis: orig.initialDiagnosis,
      intakeNotes: orig.intakeNotes,
      therapeuticApproaches: orig.therapeuticApproaches,
      approachNotes: orig.approachNotes,
      culturalContext: orig.culturalContext,
      comprehensiveAnalysis: orig.comprehensiveAnalysis,
      comprehensiveAnalysisAt: orig.comprehensiveAnalysisAt,
      // לא מעתיקים: creditBalance (יוצא ל-0 כברירת מחדל), defaultSessionPrice,
      // therapeuticGoals, sessions, payments, receipts, savedCardTokens.
      therapistId: newTherapistId,
      organizationId: null,
    },
    select: { id: true },
  });

  return cloned.id;
}

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    const now = new Date();
    const results = {
      processed: 0,
      stayedWithClinic: 0,
      followedTherapist: 0,
      cloned: 0,
      errors: [] as string[],
    };

    const expired = await prisma.therapistDeparture.findMany({
      where: {
        status: "PENDING",
        decisionDeadline: { lt: now },
      },
      select: {
        id: true,
        organizationId: true,
        departingTherapistId: true,
        organization: { select: { name: true, ownerUserId: true } },
        departingTherapist: { select: { id: true, name: true, email: true } },
        choices: {
          select: { id: true, clientId: true, choice: true, decidedAt: true },
        },
      },
    });

    if (expired.length === 0) {
      return NextResponse.json({
        success: true,
        timestamp: now.toISOString(),
        processed: 0,
        message: "אין תהליכי עזיבה שהגיעו למועד",
      });
    }

    for (const dep of expired) {
      try {
        const txResult = await withAudit(
          { kind: "system", source: "CRON", externalRef: "departure-deadlines" },
          {
            action: "complete_therapist_departure",
            targetType: "TherapistDeparture",
            targetId: dep.id,
            details: {
              organizationId: dep.organizationId,
              departingTherapistId: dep.departingTherapistId,
              clientCount: dep.choices.length,
              completedAt: now.toISOString(),
            },
          },
          async (tx) => {
            // claim atomic: רק רן אחד יזכה לסמן את ה-departure כ-COMPLETED.
            // אם בקרון קודם/בו-זמנית כבר עבר ל-COMPLETED — נצא בלי לעשות כלום.
            const claim = await tx.therapistDeparture.updateMany({
              where: { id: dep.id, status: "PENDING" },
              data: { status: "COMPLETED", completedAt: now },
            });
            if (claim.count === 0) {
              return { skipped: true as const };
            }

            for (const ch of dep.choices) {
              if (ch.choice === "UNDECIDED") {
                // ברירת מחדל בטוחה: להישאר בקליניקה
                await tx.clientDepartureChoice.update({
                  where: { id: ch.id },
                  data: {
                    choice: "STAY_WITH_CLINIC",
                    decidedAt: now,
                  },
                });
                // המטופל יישאר ויוצמד לבעל/ת הקליניקה לטיפול בידי הבעלים.
                await tx.client.update({
                  where: { id: ch.clientId },
                  data: { therapistId: dep.organization.ownerUserId },
                });
                results.stayedWithClinic++;
                continue;
              }

              if (ch.choice === "STAY_WITH_CLINIC") {
                // המטופל בחר להישאר — מצמידים אותו לבעל/ת הקליניקה.
                // הבעלים יוכל/ת לבצע העברה פנימית דרך /clinic-admin/transfer.
                // חשוב: לא נשארים אצל המטפל/ת היוצא/ת — אחרת המטפל/ת היוצא/ת
                // עדיין תראה אותם בדשבורד שלה כעצמאית (דליפת גישה).
                await tx.client.update({
                  where: { id: ch.clientId },
                  data: { therapistId: dep.organization.ownerUserId },
                });
                results.stayedWithClinic++;
                continue;
              }

              if (ch.choice === "FOLLOW_THERAPIST") {
                // העתקת תיק קליני (ללא כספים) למטפל/ת היוצא/ת (כעצמאי/ת).
                const clonedId = await cloneClinicalFile(
                  tx,
                  ch.clientId,
                  dep.departingTherapistId
                );
                results.cloned++;

                // ארכוב המטופל המקורי בקליניקה (היסטוריה נשמרת).
                // therapistId נשאר על המטפל/ת — הוא/היא תאבד גישה דרך
                // הוצאתו מהארגון בכל מקרה (organizationId יורד ל-null למטה).
                await tx.client.update({
                  where: { id: ch.clientId },
                  data: { status: "ARCHIVED" },
                });

                // לוג העברה (snapshots לעמידות שינויי שמות בעתיד)
                await tx.clientTransferLog.create({
                  data: {
                    organizationId: dep.organizationId,
                    clientId: ch.clientId,
                    fromTherapistId: dep.departingTherapistId,
                    toTherapistId: dep.departingTherapistId,
                    performedById: dep.organization.ownerUserId,
                    fromTherapistNameSnapshot:
                      dep.departingTherapist.name || "—",
                    toTherapistNameSnapshot: dep.departingTherapist.name || "—",
                    performedByNameSnapshot: "מערכת — תהליך עזיבה",
                    reason: `העתקת תיק קליני; client clone id: ${clonedId}`,
                  },
                });
                results.followedTherapist++;
              }
            }

            // הוצאת המטפל/ת היוצא/ת מהארגון. role הגלובלי לא משתנה,
            // אבל שייכות הקליניקה והclinicRole יורדים ל-null.
            await tx.user.update({
              where: { id: dep.departingTherapistId },
              data: {
                organizationId: null,
                clinicRole: null,
              },
            });

            return { skipped: false as const };
          }
        );

        if (txResult.skipped) {
          logger.info("[cron departure-deadlines] departure already claimed", {
            departureId: dep.id,
          });
          continue;
        }

        results.processed++;

        // התראת אדמין על השלמת תהליך עזיבה
        if (ADMIN_EMAIL) {
          try {
            await sendEmail({
              to: ADMIN_EMAIL,
              subject: `תהליך עזיבת מטפל/ת הושלם - ${dep.organization.name}`,
              html: `
                <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: #1e293b; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                    <h2 style="color: white; margin: 0;">תהליך עזיבה הושלם</h2>
                  </div>
                  <div style="background: #fff; padding: 25px; border: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                    <p>קליניקה: <strong>${escapeHtml(dep.organization.name)}</strong></p>
                    <p>מטפל/ת יוצא/ת: <strong>${escapeHtml(dep.departingTherapist.name || "—")}</strong></p>
                    <p>מטופלים שעברו: ${dep.choices.filter(c => c.choice === "FOLLOW_THERAPIST").length}</p>
                    <p>מטופלים שנשארו: ${dep.choices.filter(c => c.choice !== "FOLLOW_THERAPIST").length}</p>
                    <p style="margin-top:20px"><a href="${SYSTEM_URL}/admin/clinics/${dep.organizationId}">פרטי הקליניקה</a></p>
                  </div>
                </div>
              `,
            });
          } catch (mailErr) {
            logger.warn("[cron departure-deadlines] admin notification failed", {
              error: mailErr instanceof Error ? mailErr.message : String(mailErr),
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`departure ${dep.id}: ${msg}`);
        logger.error("[cron departure-deadlines] error processing departure", {
          departureId: dep.id,
          error: msg,
        });
      }
    }

    logger.info("[cron departure-deadlines] results", { data: results });

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error) {
    logger.error("[cron departure-deadlines] fatal error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "שגיאה בקרון תהליכי עזיבה" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
