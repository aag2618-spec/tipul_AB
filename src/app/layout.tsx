import type { Metadata } from "next";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "טיפול | מערכת ניהול לפרקטיקה טיפולית",
  description: "מערכת מודרנית לניהול פרקטיקה של מטפלים רגשיים - ניהול מטופלים, יומן, סיכומי טיפול ועוד",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tipul",
  },
  formatDetection: {
    telephone: false,
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
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
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="theme-color" content="#0f172a" />
      </head>
      <body className="min-h-screen bg-background antialiased font-sans">
        <Providers>
          {children}
          <Toaster position="top-center" richColors />
        </Providers>
        {/* Client Hub CRM Chat Widget */}
        {process.env.NEXT_PUBLIC_CRM_URL && process.env.NEXT_PUBLIC_CRM_API_KEY && (
          <Script
            src={`${process.env.NEXT_PUBLIC_CRM_URL}/widget.js`}
            data-api-key={process.env.NEXT_PUBLIC_CRM_API_KEY}
            data-position="bottom-left"
            strategy="lazyOnload"
          />
        )}
      </body>
    </html>
  );
}
