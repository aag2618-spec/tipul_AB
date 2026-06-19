"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function usePWA() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Register service worker
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("Service Worker registered:", registration);

          // Check for updates
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  toast.info("גרסה חדשה זמינה! רענן את הדף לעדכון.", {
                    duration: 10000,
                    action: {
                      label: "רענן",
                      onClick: () => window.location.reload(),
                    },
                  });
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });

      // Listen for controller change (new SW activated) → רענון חד-פעמי.
      // ⚠️ הגנת refreshing קריטית: בלעדיה, אם controllerchange נורה יותר מפעם
      // אחת במהלך מעבר ה-SW (skipWaiting + clients.claim), נוצרת לולאת reload
      // אינסופית — הדף "מהבהב ונתקע". הדגל מבטיח reload אחד בלבד.
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  }, []);

  // Request notification permission
  const requestNotificationPermission = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        toast.success("התראות הופעלו בהצלחה");
      }
    }
  };

  // Check if app can be installed
  const canInstall = typeof window !== "undefined" && "BeforeInstallPromptEvent" in window;

  return {
    requestNotificationPermission,
    canInstall,
  };
}
