import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { APP_LOGO } from "@/config/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyTipul | מערכת ניהול לפרקטיקה טיפולית",
  description: "מערכת מודרנית לניהול פרקטיקה של מטפלים רגשיים - ניהול מטופלים, יומן, סיכומי טיפול ועוד",
  manifest: "/manifest.json",
  icons: {
    icon: APP_LOGO.src,
    apple: APP_LOGO.src,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyTipul",
  },
  formatDetection: {
    telephone: false,
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#0f172a" />
      </head>
      <body className="min-h-screen bg-background antialiased font-sans">
        <Providers>
          {children}
          <Toaster position="top-center" richColors />
        </Providers>
        {/* H9: הוסר widget של Client Hub CRM — ה-URL לא הצביע על שירות פעיל
            (widget.js מחזיר 404) וה-NEXT_PUBLIC_CRM_API_KEY נחשף ב-bundle ללא צורך.
            אם יוטמע CRM אמיתי בעתיד — לעבור דרך server-side proxy. */}
      </body>
    </html>
  );
}
