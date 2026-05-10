// scripts/debug-cardcom-email.ts
// בודק את ה-3 התשלומים האחרונים של Cardcom (USER tenant) ומדפיס את:
//   • amount ו-status
//   • ה-client.email שהיה ב-DB בעת התשלום
//   • ה-rawResponse של Cardcom (אם יש) — מציג אם IsSendByEmail עבר
//   • client name
//
// הרצה: npx tsx --env-file=.env.local scripts/debug-cardcom-email.ts

import { prisma } from '../src/lib/prisma';

async function main() {
  const recent = await prisma.cardcomTransaction.findMany({
    where: { tenant: 'USER', status: 'APPROVED' },
    orderBy: { completedAt: 'desc' },
    take: 5,
    include: {
      payment: {
        include: { client: { select: { name: true, email: true } } },
      },
    },
  });

  for (const tx of recent) {
    console.log(`\n━━━ Transaction ${tx.id} ━━━`);
    console.log(`  Amount: ₪${Number(tx.amount)}`);
    console.log(`  Completed: ${tx.completedAt?.toISOString() ?? 'pending'}`);
    console.log(`  bulkPaymentIds: [${tx.bulkPaymentIds.length}]`);
    if (tx.payment?.client) {
      console.log(`  Client: ${tx.payment.client.name}`);
      console.log(`  client.email in DB: ${tx.payment.client.email ?? '(NULL)'}`);
    }
    const raw = (tx.rawResponse ?? {}) as Record<string, unknown>;
    if (raw && typeof raw === 'object') {
      const docInfo = (raw.DocumentInfo ?? {}) as Record<string, unknown>;
      const tInfo = (raw.TranzactionInfo ?? {}) as Record<string, unknown>;
      console.log(`  DocumentInfo.DocumentNumber: ${docInfo.DocumentNumber ?? '(none)'}`);
      console.log(`  DocumentInfo.DocumentUrl: ${docInfo.DocumentUrl ?? docInfo.DocumentLink ?? '(none)'}`);
      console.log(`  TranzactionInfo.CardOwnerEmail: ${tInfo.CardOwnerEmail ?? '(none)'}`);
      console.log(`  Cardcom returnValue: ${raw.ReturnValue ?? '(none)'}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
