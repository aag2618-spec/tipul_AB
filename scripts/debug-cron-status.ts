// Read-only diagnostic to figure out why daily summary emails stopped.
// Checks:
//   1. User profile (role, clinicRole, organizationId, isBlocked, email)
//   2. NotificationSettings (is email enabled? what time?)
//   3. Notifications created in last 14 days (was cron running at all?)
//   4. CommunicationLog (was email actually sent?)
//   5. Pending payments / scheduled sessions today/tomorrow
// Usage: npx tsx scripts/debug-cron-status.ts
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const USER_EMAIL = "aag2618@gmail.com";

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clinicRole: true,
      organizationId: true,
      isBlocked: true,
    },
  });

  if (!user) {
    console.error(`User ${USER_EMAIL} not found.`);
    process.exit(1);
  }

  console.log("\n===== 1. USER PROFILE =====");
  console.table([user]);

  console.log("\n===== 2. NOTIFICATION SETTINGS =====");
  const settings = await prisma.notificationSetting.findMany({
    where: { userId: user.id },
  });
  if (settings.length === 0) {
    console.log("(No settings rows — defaults apply: enabled, 08:00 morning, 20:00 evening)");
  } else {
    console.table(settings);
  }

  console.log("\n===== 3. NOTIFICATIONS CREATED IN LAST 14 DAYS =====");
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
  const recentNotifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: fourteenDaysAgo },
    },
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  console.log(`Found ${recentNotifications.length} notifications:`);
  if (recentNotifications.length > 0) {
    console.table(
      recentNotifications.map((n) => ({
        type: n.type,
        title: n.title.substring(0, 50),
        status: n.status,
        createdAt: n.createdAt.toISOString(),
      }))
    );
  }

  console.log("\n===== 4. EMAIL LOG IN LAST 14 DAYS (CommunicationLog channel=EMAIL) =====");
  const recentEmails = await prisma.communicationLog.findMany({
    where: {
      userId: user.id,
      channel: "EMAIL",
      createdAt: { gte: fourteenDaysAgo },
    },
    select: {
      id: true,
      type: true,
      subject: true,
      status: true,
      errorMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  console.log(`Found ${recentEmails.length} email logs:`);
  if (recentEmails.length > 0) {
    console.table(
      recentEmails.map((e) => ({
        type: e.type,
        subject: e.subject?.substring(0, 50) || "",
        status: e.status,
        error: e.errorMessage?.substring(0, 40) || "",
        createdAt: e.createdAt.toISOString(),
      }))
    );
  }

  console.log("\n===== 5. CONTEXT: PENDING PAYMENTS + UPCOMING SESSIONS =====");
  if (!user.organizationId) {
    console.log("(no organizationId — skipping scope-based queries)");
    return;
  }

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const todayStart = new Date(todayStr + "T00:00:00+03:00"); // DST קיץ
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const dayAfter = new Date(todayStart.getTime() + 2 * 86400000);

  const sessionsToday = await prisma.therapySession.count({
    where: {
      organizationId: user.organizationId,
      startTime: { gte: todayStart, lt: tomorrowStart },
      status: { notIn: ["CANCELLED"] },
    },
  });
  const sessionsTomorrow = await prisma.therapySession.count({
    where: {
      organizationId: user.organizationId,
      startTime: { gte: tomorrowStart, lt: dayAfter },
      status: "SCHEDULED",
    },
  });
  const pendingPayments = await prisma.payment.count({
    where: {
      client: { organizationId: user.organizationId },
      status: "PENDING",
      parentPaymentId: null,
    },
  });

  console.table({
    sessionsToday,
    sessionsTomorrow,
    pendingPayments,
    todayDateIsrael: todayStr,
  });

  console.log("\n===== DIAGNOSIS =====");
  if (recentNotifications.length === 0 && recentEmails.length === 0) {
    console.log("❌ NO notifications and NO emails in last 14 days.");
    console.log("   → ה-cron כנראה לא רץ או נכשל לפני שהגיע לכאן.");
    console.log("   → צריך לבדוק Render logs של daily-summary-notifications.");
  } else if (recentNotifications.length === 0 && recentEmails.length > 0) {
    console.log("⚠️  יש emails אבל אין notifications — מוזר. ייתכן Notification.create נכשל.");
  } else if (recentNotifications.length > 0 && recentEmails.length === 0) {
    console.log("⚠️  יש notifications אבל אין emails — בעיית sendEmail/Resend.");
  } else {
    console.log("✓ יש גם notifications וגם emails — ה-cron עובד.");
    console.log("  אם חסר ימים ספציפיים — אולי באמת אין פגישות/תשלומים ביום ההוא.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
