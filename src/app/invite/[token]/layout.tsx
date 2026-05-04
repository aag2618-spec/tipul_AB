import type { Metadata } from "next";

// noindex — הזמנות פרטיות לא צריכות להיכנס לאינדקס מנועי חיפוש.
// defense-in-depth מעבר לטוקן הסודי בנתיב.
export const metadata: Metadata = {
  title: "הזמנה להצטרף לקליניקה | MyTipul",
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
