// scripts/debug-cardcom-history.ts
// דוח חקירה מלא של Cardcom: עבור משתמש (userId) או מספרי קבלה ספציפיים,
// מציג את הדרך מה-CardcomInvoice → Payment (parent+children) → CardcomTransaction.
//
// הרצה:
//   npx tsx --env-file=.env.local scripts/debug-cardcom-history.ts <userId>
//   npx tsx --env-file=.env.local scripts/debug-cardcom-history.ts --receipts 641415 641416
//   npx tsx --env-file=.env.local scripts/debug-cardcom-history.ts --recent 20
//
// פלט: דוח טקסטואלי בעברית + אנגלית עם כל מה שצריך כדי להבין למה
// Cardcom רואה X ואצלנו רואים Y.

import { prisma } from '../src/lib/prisma';

interface ParsedArgs {
  userId?: string;
  receipts?: string[];
  recent?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--receipts') {
      const vals: string[] = [];
      i++;
      while (i < argv.length && !argv[i].startsWith('--')) {
        vals.push(argv[i]);
        i++;
      }
      out.receipts = vals;
      continue;
    }
    if (a === '--recent') {
      out.recent = Number(argv[i + 1] ?? 10);
      i += 2;
      continue;
    }
    if (!a.startsWith('--')) {
      out.userId = a;
    }
    i++;
  }
  return out;
}

function fmt(n: number | null | undefined): string {
  return n == null ? '—' : `₪${Number(n).toFixed(2)}`;
}

function dateStr(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19);
}

async function inspectInvoice(documentNumber: string): Promise<void> {
  console.log(`\n━━━━━━ CardcomInvoice ${documentNumber} ━━━━━━`);
  const inv = await prisma.cardcomInvoice.findFirst({
    where: { cardcomDocumentNumber: documentNumber },
    include: {
      cardcomTransaction: true,
      recipientClient: { select: { id: true, name: true, email: true } },
    },
  });
  if (!inv) {
    console.log('  ❌ לא נמצא CardcomInvoice עם המספר הזה');
    return;
  }
  console.log(`  tenant: ${inv.tenant}`);
  console.log(`  documentType: ${inv.cardcomDocumentType}`);
  console.log(`  amount: ${fmt(Number(inv.amount))}`);
  console.log(`  issuedAt: ${dateStr(inv.issuedAt)}`);
  console.log(`  occurredAt: ${dateStr(inv.occurredAt)}`);
  console.log(`  pdfUrl: ${inv.pdfUrl ?? '—'}`);
  console.log(`  paymentId: ${inv.paymentId ?? '—'}`);
  console.log(`  recipient: ${inv.recipientClient?.name ?? inv.subscriberNameSnapshot} <${inv.recipientClient?.email ?? inv.subscriberEmailSnapshot ?? '—'}>`);
  console.log(`  cardcomTransactionId: ${inv.cardcomTransactionId ?? '—'}`);
  if (inv.cardcomTransaction) {
    console.log(`  ↳ tx.amount: ${fmt(Number(inv.cardcomTransaction.amount))}, tx.status: ${inv.cardcomTransaction.status}`);
    console.log(`  ↳ tx.lowProfileId: ${inv.cardcomTransaction.lowProfileId ?? '—'}`);
    console.log(`  ↳ tx.transactionId: ${inv.cardcomTransaction.transactionId ?? '—'}`);
  }
  if (inv.paymentId) {
    await inspectPayment(inv.paymentId);
  }
}

async function inspectPayment(paymentId: string): Promise<void> {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      client: { select: { name: true, email: true } },
      session: { select: { startTime: true } },
      childPayments: {
        include: {
          cardcomInvoices: { select: { cardcomDocumentNumber: true, amount: true } },
          cardcomTransactions: { select: { id: true, status: true, amount: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      parentPayment: { select: { id: true, amount: true, expectedAmount: true, status: true } },
      cardcomInvoices: { select: { cardcomDocumentNumber: true, amount: true } },
    },
  });
  if (!p) {
    console.log(`    ❌ Payment ${paymentId} לא נמצא`);
    return;
  }
  const indent = p.parentPaymentId ? '    ↳' : '  ►';
  console.log(`${indent} Payment ${p.id}`);
  console.log(`     client: ${p.client?.name ?? '—'} <${p.client?.email ?? '—'}>`);
  console.log(`     session: ${dateStr(p.session?.startTime ?? null)}, sessionId=${p.sessionId ?? '—'}`);
  console.log(`     amount: ${fmt(Number(p.amount))} / expected: ${fmt(Number(p.expectedAmount))}`);
  console.log(`     method: ${p.method}, status: ${p.status}, paymentType: ${p.paymentType}`);
  console.log(`     paidAt: ${dateStr(p.paidAt)}, createdAt: ${dateStr(p.createdAt)}`);
  console.log(`     hasReceipt: ${p.hasReceipt}, receiptNumber: ${p.receiptNumber ?? '—'}`);
  if (p.parentPayment) {
    console.log(`     parent ► ${p.parentPayment.id} (${fmt(Number(p.parentPayment.amount))}/${fmt(Number(p.parentPayment.expectedAmount))} ${p.parentPayment.status})`);
  }
  for (const inv of p.cardcomInvoices) {
    console.log(`     📄 invoice ${inv.cardcomDocumentNumber} ${fmt(Number(inv.amount))}`);
  }
  for (const c of p.childPayments) {
    console.log(`     ▽ child ${c.id}: ${fmt(Number(c.amount))} ${c.method} ${c.status} ${c.paymentType}`);
    for (const inv of c.cardcomInvoices) {
      console.log(`        📄 child invoice ${inv.cardcomDocumentNumber} ${fmt(Number(inv.amount))}`);
    }
    for (const tx of c.cardcomTransactions ?? []) {
      console.log(`        💳 tx ${tx.id} ${fmt(Number(tx.amount))} ${tx.status}`);
    }
  }
}

async function listRecent(userId: string | undefined, limit: number): Promise<void> {
  const where = userId ? { issuerUserId: userId } : {};
  const invoices = await prisma.cardcomInvoice.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    take: limit,
    select: {
      cardcomDocumentNumber: true,
      issuedAt: true,
      amount: true,
      paymentId: true,
      cardcomDocumentType: true,
    },
  });
  console.log(`\n━━━━━━ ${invoices.length} CardcomInvoices אחרונים ━━━━━━`);
  for (const inv of invoices) {
    console.log(
      `  ${inv.cardcomDocumentNumber}  ${dateStr(inv.issuedAt)}  ${fmt(Number(inv.amount))}  ${inv.cardcomDocumentType}  → payment ${inv.paymentId ?? '—'}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.userId && !args.receipts && !args.recent) {
    console.error('שימוש: <userId> | --receipts <num...> | --recent <N>');
    process.exit(1);
  }
  if (args.recent) {
    await listRecent(args.userId, args.recent);
  }
  if (args.receipts) {
    for (const r of args.receipts) {
      await inspectInvoice(r);
    }
  }
  if (args.userId && !args.receipts && !args.recent) {
    // תקציר ל-userId: 20 קבלות אחרונות + 5 פגישות אחרונות עם תשלום.
    await listRecent(args.userId, 20);
    console.log('\n━━━━━━ Payments אחרונים על המשתמש ━━━━━━');
    const recentPayments = await prisma.payment.findMany({
      where: { client: { therapistId: args.userId }, parentPaymentId: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true },
    });
    for (const p of recentPayments) {
      await inspectPayment(p.id);
    }
  }
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
