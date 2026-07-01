// READ-ONLY: מאבחן למה בעל קליניקה חדש לא מצליח להיכנס (גלגל אינסופי ב-/clinic-admin).
// לא משנה כלום. הרצה: npx tsx scripts/diagnose-clinic-owner-login.ts <email>
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Make sure .env.local exists.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TARGET_EMAIL = process.argv[2] || "p42344234@gmail.com";

async function main() {
  console.log(`\n=== USER: ${TARGET_EMAIL} ===`);
  const user = await prisma.user.findFirst({
    where: { email: { equals: TARGET_EMAIL, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clinicRole: true,
      organizationId: true,
      isBlocked: true,
      emailVerified: true,
      emailVerificationToken: true,
      emailVerificationExpires: true,
      twoFactorEnabled: true,
      twoFactorMethod: true,
      lockedUntil: true,
      failedLoginAttempts: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      lastActivityAt: true,
      passwordChangedAt: true,
      sessionVersion: true,
      createdAt: true,
    },
  });

  if (!user) {
    console.log("❌ לא נמצא משתמש עם המייל הזה.");
    return;
  }

  // לא מדפיסים את ה-hash של הסיסמה — רק האם קיימת.
  const userWithPwFlag = await prisma.user.findUnique({
    where: { id: user.id },
    select: { password: true },
  });

  console.table([
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clinicRole: user.clinicRole,
      organizationId: user.organizationId,
      hasPassword: Boolean(userWithPwFlag?.password),
    },
  ]);

  console.log("\n--- מצב אימות/חסימה ---");
  console.table([
    {
      isBlocked: user.isBlocked,
      emailVerified: user.emailVerified ? user.emailVerified.toISOString() : "❌ NULL (לא אומת)",
      hasVerifyToken: Boolean(user.emailVerificationToken),
      verifyExpires: user.emailVerificationExpires?.toISOString() ?? "—",
      lockedUntil: user.lockedUntil?.toISOString() ?? "—",
      failedLoginAttempts: user.failedLoginAttempts,
    },
  ]);

  console.log("\n--- 2FA / מנוי ---");
  console.table([
    {
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod ?? "—",
      subscriptionStatus: user.subscriptionStatus ?? "—",
      trialEndsAt: user.trialEndsAt?.toISOString() ?? "—",
      lastActivityAt: user.lastActivityAt?.toISOString() ?? "❌ NULL (כניסה ראשונה)",
      sessionVersion: user.sessionVersion,
      createdAt: user.createdAt.toISOString(),
    },
  ]);

  // הארגון של המשתמש (אם משויך) + הארגון שבבעלותו (לפי ownerUserId)
  console.log("\n=== ORGANIZATION (לפי organizationId של המשתמש) ===");
  if (user.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        id: true,
        name: true,
        ownerUserId: true,
        ownerIsTherapist: true,
        subscriptionStatus: true,
        pricingPlanId: true,
        pricingPlan: { select: { name: true, isActive: true } },
        _count: { select: { members: true, clients: true } },
      },
    });
    console.table(org ? [{
      id: org.id,
      name: org.name,
      ownerUserId: org.ownerUserId,
      ownerMatchesUser: org.ownerUserId === user.id,
      ownerIsTherapist: org.ownerIsTherapist,
      subscriptionStatus: org.subscriptionStatus,
      plan: org.pricingPlan?.name ?? "—",
      planActive: org.pricingPlan?.isActive ?? "—",
      members: org._count.members,
      clients: org._count.clients,
    }] : []);
  } else {
    console.log("⚠️  למשתמש אין organizationId! (לא משויך לקליניקה — זו כנראה הבעיה)");
  }

  // האם המשתמש בעלים של ארגון כלשהו (גם אם organizationId לא מסונכרן)
  console.log("\n=== ORGANIZATION (לפי ownerUserId = המשתמש) ===");
  const ownedOrg = await prisma.organization.findUnique({
    where: { ownerUserId: user.id },
    select: { id: true, name: true, ownerIsTherapist: true, subscriptionStatus: true },
  });
  if (ownedOrg) {
    console.table([{
      id: ownedOrg.id,
      name: ownedOrg.name,
      organizationIdSynced: ownedOrg.id === user.organizationId,
      ownerIsTherapist: ownedOrg.ownerIsTherapist,
      subscriptionStatus: ownedOrg.subscriptionStatus,
    }]);
  } else {
    console.log("— המשתמש אינו רשום כ-ownerUserId של אף ארגון.");
  }

  // אבחון: מה הקוד יחליט?
  console.log("\n=== אבחון לוגיקה ===");
  const isClinicOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
  console.log(`isClinicOwner (role=CLINIC_OWNER || clinicRole=OWNER): ${isClinicOwner ? "✅ TRUE" : "❌ FALSE"}`);
  console.log(`  → /api/clinic-admin/me יחזיר: ${isClinicOwner ? "200 (ok)" : "403 (אין הרשאה)"}`);

  // middleware (proxy.ts) בודק רק את ה-role ב-JWT — לא clinicRole.
  const middlewareAllowsClinicAdmin = user.role === "ADMIN" || user.role === "CLINIC_OWNER";
  console.log(`\nmiddleware (proxy.ts) על /clinic-admin: ${middlewareAllowsClinicAdmin ? "✅ מאשר (role privileged)" : "❌ חוסם → redirect ל-/dashboard"}`);

  // /dashboard/page.tsx: isNonTherapistManager → redirect ל-/clinic-admin (רק אם 0 מטופלים משלו)
  let ownClientCount = 0;
  if (user.organizationId) {
    ownClientCount = await prisma.client.count({
      where: { organizationId: user.organizationId, therapistId: user.id },
    });
  }
  const orgForFlag = user.organizationId
    ? await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { ownerIsTherapist: true },
      })
    : null;
  const ownerIsTherapist = orgForFlag?.ownerIsTherapist ?? null;
  const isNonTherapistManager = isClinicOwner && ownerIsTherapist === false;
  console.log(`\nownerIsTherapist (על הארגון): ${ownerIsTherapist}`);
  console.log(`ownClientCount (מטופלים משויכים ל-יצחק עצמו): ${ownClientCount}`);
  console.log(`isNonTherapistManager: ${isNonTherapistManager ? "✅ TRUE" : "❌ FALSE"}`);
  const dashboardRedirectsToClinicAdmin = isNonTherapistManager && Boolean(user.organizationId) && ownClientCount === 0;
  console.log(`  → /dashboard ${dashboardRedirectsToClinicAdmin ? "ינתב ל-/clinic-admin (redirect)" : "יציג את הדשבורד הטיפולי (ללא redirect)"}`);

  // האם נוצרת לולאה?
  console.log("\n=== הכרעה: לולאת ניתוב? ===");
  if (dashboardRedirectsToClinicAdmin && !middlewareAllowsClinicAdmin) {
    console.log("❌❌ לולאה אינסופית: /dashboard → /clinic-admin → (middleware חוסם) → /dashboard → ...");
  } else if (dashboardRedirectsToClinicAdmin && middlewareAllowsClinicAdmin) {
    console.log("✅ אין לולאה: /dashboard מנתב ל-/clinic-admin, ו-middleware מאשר. הדף אמור להיטען.");
  } else {
    console.log("✅ אין לולאת ניתוב מהסוג הזה.");
  }
  const emailOk = Boolean(user.emailVerified) || user.role === "ADMIN" || (!user.emailVerificationToken && !user.emailVerificationExpires);
  console.log(`login email-gate: ${emailOk ? "✅ עובר" : "❌ נחסם (יבקש אימות מייל)"}`);
  const locked = user.lockedUntil && user.lockedUntil > new Date();
  console.log(`account lock: ${locked ? "❌ נעול עד " + user.lockedUntil?.toISOString() : "✅ לא נעול"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
