// READ-ONLY: משחזר בדיוק את השאילתה של /api/clinic-admin/me כדי לבדוק אם היא
// נכשלת (500) עבור משתמש מסוים, או מחזירה organization=null (→ מסך שגיאה).
// הרצה: npx tsx scripts/check-clinic-admin-me.ts <email>
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

const TARGET_EMAIL = process.argv[2] || "p42344234@gmail.com";

async function main() {
  const u = await prisma.user.findFirst({
    where: { email: { equals: TARGET_EMAIL, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  if (!u) {
    console.log(`❌ לא נמצא משתמש: ${TARGET_EMAIL}`);
    return;
  }
  console.log(`\nבודק את שאילתת /api/clinic-admin/me עבור: ${u.email} (${u.id})`);

  try {
    // העתק מדויק של ה-select מתוך src/app/api/clinic-admin/me/route.ts
    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clinicRole: true,
        organizationId: true,
        secretaryPermissions: true,
        organization: {
          select: {
            id: true,
            name: true,
            aiTier: true,
            subscriptionStatus: true,
            pricingPlan: { select: { name: true } },
          },
        },
      },
    });

    console.log("\n✅ השאילתה הצליחה (לא 500). תוצאה:");
    console.table([
      {
        role: user?.role,
        clinicRole: user?.clinicRole,
        organizationId: user?.organizationId ?? "NULL",
        orgLoaded: user?.organization ? "כן" : "❌ NULL",
        orgName: user?.organization?.name ?? "—",
        pricingPlan: user?.organization?.pricingPlan?.name ?? "❌ NULL (אין תוכנית)",
        aiTier: user?.organization?.aiTier ?? "—",
        subStatus: user?.organization?.subscriptionStatus ?? "—",
      },
    ]);

    const isClinicOwner = user?.role === "CLINIC_OWNER" || user?.clinicRole === "OWNER";
    console.log(`\nisClinicOwner → ${isClinicOwner ? "✅ TRUE (200, לא 403)" : "❌ FALSE (403!)"}`);
    if (!user?.organization) {
      console.log("⚠️  organization=NULL → ה-layout יציג מסך שגיאה 'אינך משויך/ת', לא ספינר.");
    } else {
      console.log("✅ organization נטען → ה-layout אמור לרנדר את התוכן (לא ספינר ולא שגיאה).");
    }
  } catch (e) {
    console.log("\n❌❌❌ השאילתה זרקה שגיאה — זה ה-500 שגורם לספינר האינסופי!");
    console.error(e);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
