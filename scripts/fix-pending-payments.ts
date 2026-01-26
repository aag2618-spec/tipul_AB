import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPendingPayments() {
  try {
    console.log('🔍 מחפש תשלומים לתיקון...');

    // מצא את כל התשלומים הממתינים שבהם amount = expectedAmount
    const paymentsToFix = await prisma.payment.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        session: true,
      },
    });

    console.log(`📝 נמצאו ${paymentsToFix.length} תשלומים`);

    let fixed = 0;
    for (const payment of paymentsToFix) {
      const amount = Number(payment.amount);
      const expectedAmount = Number(payment.expectedAmount);

      // אם amount = expectedAmount, זה אומר שזה תשלום שנוצר בטעות כ"שולם" במקום "ממתין"
      // נתקן אותו ל-amount = 0
      if (amount === expectedAmount && amount > 0 && payment.sessionId) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            amount: 0,
          },
        });
        fixed++;
        console.log(`✅ תוקן תשלום ${payment.id} - סכום: ₪${expectedAmount}`);
      }
    }

    console.log(`\n✨ תוקנו ${fixed} תשלומים בהצלחה!`);
  } catch (error) {
    console.error('❌ שגיאה:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPendingPayments();
