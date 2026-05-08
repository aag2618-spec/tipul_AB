// scripts/backfill-bulk-cardcom-receipts.ts
//
// תיקון חד-פעמי לתשלומים מצרפיים באשראי שעברו לפני התיקון של hasReceipt על
// children. ה-Umbrella קיבל את הקבלה (hasReceipt + receiptNumber + receiptUrl
// מ-Cardcom), אבל ה-children שנוצרו ב-distribute היו עם hasReceipt=false
// ולא הופיעו בדף הקבלות. הסקריפט מעתיק את ה-receipt info מה-umbrella
// לכל child שמסומן `notes` כ-"Bulk Cardcom distribution" ואין לו עדיין.
//
// הרצה:
//   cd tipul_AB-main && npx tsx scripts/backfill-bulk-cardcom-receipts.ts
//
// SAFETY:
//   • DRY-RUN by default — מדפיס את מה שהיה משתנה בלי לכתוב.
//   • לכתיבה אמיתית: APPLY=1 npx tsx scripts/backfill-bulk-cardcom-receipts.ts
//   • Idempotent: רץ פעמיים = אותה תוצאה (מתעלם מ-children שכבר תוקנו).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';

async function backfill() {
  console.log(APPLY ? '⚠️  APPLY mode — writing changes' : '🧪 DRY-RUN (set APPLY=1 to write)');

  // 1. כל ה-Umbrella payments עם receipt תקין (hasReceipt + receiptNumber)
  const umbrellas = await prisma.payment.findMany({
    where: {
      notes: { startsWith: '[BULK_UMBRELLA]' },
      hasReceipt: true,
      receiptNumber: { not: null },
    },
    select: { id: true, receiptNumber: true, receiptUrl: true },
  });
  console.log(`📦 Umbrellas with receipt: ${umbrellas.length}`);

  let totalFixedChildren = 0;
  let totalSkippedChildren = 0;

  for (const umbrella of umbrellas) {
    // מציאת CardcomTransaction של ה-umbrella → לקבלת cardcomTransactionId
    // שמשמש לזיהוי children (notes מכיל "tx:...").
    const tx = await prisma.cardcomTransaction.findFirst({
      where: { paymentId: umbrella.id },
      select: { id: true, bulkPaymentIds: true },
    });
    if (!tx || tx.bulkPaymentIds.length === 0) continue;

    // ה-children זוהו ע״י parentPaymentId IN bulkPaymentIds + notes contains tx.id.
    const children = await prisma.payment.findMany({
      where: {
        parentPaymentId: { in: tx.bulkPaymentIds },
        notes: { contains: tx.id },
      },
      select: { id: true, hasReceipt: true, parentPaymentId: true },
    });

    const needFix = children.filter((c) => !c.hasReceipt);
    if (needFix.length === 0) {
      totalSkippedChildren += children.length;
      continue;
    }

    console.log(
      `\n🔧 Umbrella ${umbrella.id} (receipt ${umbrella.receiptNumber}) → ${needFix.length}/${children.length} children to fix`
    );
    for (const child of needFix) {
      console.log(`   ↳ child ${child.id} (parent ${child.parentPaymentId})`);
      if (APPLY) {
        await prisma.payment.update({
          where: { id: child.id },
          data: {
            hasReceipt: true,
            receiptNumber: umbrella.receiptNumber,
            receiptUrl: umbrella.receiptUrl,
          },
        });
      }
      totalFixedChildren++;
    }
  }

  console.log(
    `\n✅ Done. Fixed children: ${totalFixedChildren}. Skipped (already had receipt): ${totalSkippedChildren}.`
  );
  if (!APPLY) console.log('(DRY-RUN — re-run with APPLY=1 to write)');
}

backfill()
  .catch((err) => {
    console.error('❌ Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
