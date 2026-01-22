"use client";

import { SessionProvider } from "next-auth/react";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { usePWA } from "@/hooks/use-pwa";
import { useEffect } from "react";

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
      <PWAProvider>
        {children}
        <PWAInstallPrompt />
      </PWAProvider>
    </SessionProvider>
  );
}

