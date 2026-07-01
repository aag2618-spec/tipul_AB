// READ-ONLY: בודק את הגדרות הקבלות של aag2618 + מאתר אי-סנכרון
// (sendReceiptToClient=true אבל sendPaymentReceipt=false → המתג דלוק אך
// ה-gate חוסם, ולכן בפועל לא נשלחת קבלה). לא משנה כלום.
// הרצה: npx tsx scripts/check-receipt-settings.ts
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

async function main() {
  console.log("\n=== ההגדרות של aag2618@gmail.com ===");
  const me = await prisma.user.findUnique({
    where: { email: "aag2618@gmail.com" },
    select: { id: true, email: true, businessType: true },
  });
  if (me) {
    const cs = await prisma.communicationSetting.findUnique({
      where: { userId: me.id },
      select: {
        sendPaymentReceipt: true,
        sendReceiptToClient: true,
        sendReceiptToTherapist: true,
      },
    });
    console.table([{ email: me.email, businessType: me.businessType, hasRow: !!cs, ...cs }]);
    if (cs) {
      const blocked = cs.sendPaymentReceipt === false && cs.sendReceiptToClient === true;
      console.log(
        blocked
          ? "⚠️  אצלך: המתג 'שלח קבלה למטופל' דלוק אבל הדגל הראשי כבוי → קבלות לא נשלחות!"
          : "✓ אצלך אין סתירה בין המתג לדגל הראשי."
      );
    } else {
      console.log("ℹ️  אין רשומת communicationSetting → רצה על ברירות מחדל (שולח ללקוח).");
    }
  }

  console.log("\n=== היקף הסתירה בכל המשתמשים ===");
  const total = await prisma.communicationSetting.count();
  const blocked = await prisma.communicationSetting.count({
    where: { sendPaymentReceipt: false, sendReceiptToClient: true },
  });
  const onlyTherapistBlocked = await prisma.communicationSetting.count({
    where: { sendPaymentReceipt: false, sendReceiptToTherapist: true },
  });
  console.table([
    { metric: 'סה"כ רשומות הגדרות', value: total },
    { metric: "מתג-ללקוח דלוק אך דגל-ראשי כבוי (חסום)", value: blocked },
    { metric: "מתג-עותק-למטפל דלוק אך דגל-ראשי כבוי (חסום)", value: onlyTherapistBlocked },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
