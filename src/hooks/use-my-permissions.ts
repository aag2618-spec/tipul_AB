"use client";

import { useEffect, useState } from "react";

/**
 * Hook לטעינת ההרשאות האפקטיביות של המשתמש הנוכחי ל-Client Components.
 *
 * שימוש:
 *   const { permissions, isLoading } = useMyPermissions();
 *   if (permissions?.canViewPayments) { ...render payment buttons... }
 *
 * Phase 3: ה-default האופטימי הוא "true" לכל ההרשאות עד שהטעינה תסתיים.
 * הסיבה: זה UI gating בלבד — השרת תמיד אוכף את ההרשאה האמיתית, אז flash-of-
 * unauthorized-button במשך מילישנייה גרוע פחות מ-flash-of-hidden-button
 * לבעלים/מטפלים שאמורים תמיד לראות הכול. למזכירה ללא הרשאה הכפתור ייעלם
 * ברגע שהתשובה תגיע (~50-200ms בהתאם לרשת/cache).
 */

export type MyPermissions = {
  canViewPayments: boolean;
  canIssueReceipts: boolean;
  canSendReminders: boolean;
  canCreateClient: boolean;
  canViewDebts: boolean;
  canViewStats: boolean;
  canViewConsentForms: boolean;
  canTransferClient: boolean;
};

export type MyPermissionsResponse = {
  isSecretary: boolean;
  clinicRole: "OWNER" | "THERAPIST" | "SECRETARY" | null;
  permissions: MyPermissions;
};

const OPTIMISTIC_DEFAULT: MyPermissionsResponse = {
  isSecretary: false,
  clinicRole: null,
  permissions: {
    canViewPayments: true,
    canIssueReceipts: true,
    canSendReminders: true,
    canCreateClient: true,
    canViewDebts: true,
    canViewStats: true,
    canViewConsentForms: true,
    canTransferClient: true,
  },
};

// Phase 3: על שגיאה / non-OK — fail-closed לטובת UI safety. אם המזכירה ניגשה
// למסך ולא הצלחנו לטעון הרשאות (רשת/שגיאת שרת), עדיף להסתיר תכנים רגישים
// מאשר להציגם בטעות. ה-API ממילא יחזיר 403 אם תנסה לפעול, אבל זה מקצר את
// חלון החשיפה ומונע UX מבלבל.
const FAIL_CLOSED: MyPermissionsResponse = {
  isSecretary: true,
  clinicRole: "SECRETARY",
  permissions: {
    canViewPayments: false,
    canIssueReceipts: false,
    canSendReminders: false,
    canCreateClient: false,
    canViewDebts: false,
    canViewStats: false,
    canViewConsentForms: false,
    canTransferClient: false,
  },
};

export function useMyPermissions() {
  const [data, setData] = useState<MyPermissionsResponse>(OPTIMISTIC_DEFAULT);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/permissions", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setData(FAIL_CLOSED);
          setIsLoading(false);
          return;
        }
        const json = (await res.json()) as MyPermissionsResponse | null;
        if (cancelled) return;
        if (json && json.permissions) {
          setData(json);
        } else {
          setData(FAIL_CLOSED);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(FAIL_CLOSED);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ...data,
    isLoading,
  };
}
