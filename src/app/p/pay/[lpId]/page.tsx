// src/app/p/pay/[lpId]/page.tsx
// Public gateway between the link sent to the client and the actual Cardcom
// payment page. NO auth — the client clicked a link from SMS/email.
//
// Behavior:
//   1. שבת/יו״ט → מציגים מסך "שבת מקור הברכה" (חסימה הלכתית)
//   2. transaction לא נמצא → 404
//   3. paymentPageUrl ריק (legacy) → הודעת שגיאה
//   4. כבר שולם / נדחה / בוטל → סטטוס מתאים
//   5. אחרת → redirect 307 ל-Cardcom
//
// SECURITY: lowProfileId הוא 24+ chars CUID/UUID — ניחוש לא ריאלי. אנחנו
// לא חושפים סכום או שם הלקוח בעמוד הזה (רק במייל/SMS המקוריים), כדי
// שמי שמחזיק את הקישור לא יראה פרטים פיננסיים.

import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { isShabbatOrYomTov } from "@/lib/shabbat";

export const dynamic = "force-dynamic";

// Defense-in-depth: לוודא שה-URL שאליו אנחנו מפנים הוא של Cardcom בלבד.
// `paymentPageUrl` נכתב מ-Cardcom API response, אבל אם data corruption / משתמש
// פגום הזין URL זדוני — `redirect()` של Next.js לא מאמת host. dot-boundary
// check מונע hosts מתחזים כמו `evilcardcom.co.il`.
function isCardcomUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    const allowed = ["cardcom.solutions", "cardcom.co.il"];
    return allowed.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

interface Props {
  params: Promise<{ lpId: string }>;
}

export default async function CardcomPayGatewayPage({ params }: Props) {
  const { lpId } = await params;

  if (!lpId || lpId.length < 8) notFound();

  const tx = await prisma.cardcomTransaction.findUnique({
    where: { lowProfileId: lpId },
    select: {
      status: true,
      paymentPageUrl: true,
    },
  });

  if (!tx) notFound();

  if (tx.status === "APPROVED") {
    return (
      <Centered title="התשלום כבר הושלם" tone="success">
        <p>הקישור הזה שייך לתשלום שכבר הסתיים בהצלחה. הקבלה נשלחה לכתובת המייל.</p>
      </Centered>
    );
  }
  if (tx.status === "DECLINED" || tx.status === "FAILED") {
    return (
      <Centered title="התשלום נכשל" tone="error">
        <p>התשלום לא הושלם. נא לפנות למטפל לקבלת קישור חדש.</p>
      </Centered>
    );
  }
  if (tx.status === "CANCELLED") {
    return (
      <Centered title="הקישור בוטל" tone="error">
        <p>קישור התשלום בוטל ע״י המטפל. נא לפנות אליו לקבלת קישור חדש.</p>
      </Centered>
    );
  }

  if (!tx.paymentPageUrl || !isCardcomUrl(tx.paymentPageUrl)) {
    return (
      <Centered title="קישור תשלום לא תקין" tone="error">
        <p>פרטי התשלום אינם זמינים. נא לפנות למטפל לקבלת קישור חדש.</p>
      </Centered>
    );
  }

  if (isShabbatOrYomTov()) {
    return (
      <Centered title="שבת מקור הברכה" tone="shabbat">
        <p>במוצאי שבת/חג תוכל/י להמשיך בתשלום באותו קישור.</p>
        <p style={{ marginTop: 16, fontSize: 14, color: "#666" }}>
          תשלומים חסומים בשבת ויום טוב על פי הלכה.
        </p>
      </Centered>
    );
  }

  redirect(tx.paymentPageUrl);
}

function Centered({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "success" | "error" | "shabbat";
  children: React.ReactNode;
}) {
  const accent =
    tone === "success" ? "#0f766e" : tone === "shabbat" ? "#7c3aed" : "#b91c1c";
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "#f9fafb",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          padding: "40px 32px",
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1 style={{ color: accent, marginTop: 0, fontSize: 24 }}>{title}</h1>
        <div style={{ color: "#374151", fontSize: 16, lineHeight: 1.6 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
