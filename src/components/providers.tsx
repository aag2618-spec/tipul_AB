"use client";

import { SessionProvider } from "next-auth/react";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { usePWA } from "@/hooks/use-pwa";

interface ProvidersProps {
  children: React.ReactNode;
}

function PWAProvider({ children }: { children: React.ReactNode }) {
  usePWA();
  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      {/* Banner מוצג רק כש-actingAs פעיל ב-token. זה הכרחי שיהיה גלובלי
          (לא רק ב-clinic-admin) כי ה-OWNER במצב impersonation מנווט ל-dashboard
          של ה-target ולא רוצים לאבד את הכפתור היציאה. */}
      <ImpersonationBanner />
      <PWAProvider>
        {children}
        <PWAInstallPrompt />
      </PWAProvider>
    </SessionProvider>
  );
}

