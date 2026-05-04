import type { Metadata } from "next";

// noindex + no-referrer — הזמנות פרטיות לא צריכות להיכנס לאינדקס מנועי חיפוש,
// וגם אסור שהטוקן ידלוף ב-Referer header אם המוזמן/ת לוחץ על קישור חיצוני
// (לדוגמה כפתור "MyTipul" בכותרת/פוטר). defense-in-depth מעבר לטוקן בנתיב.
export const metadata: Metadata = {
  title: "הזמנה להצטרף לקליניקה | MyTipul",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
