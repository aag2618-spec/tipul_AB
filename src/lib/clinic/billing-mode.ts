// ============================================================================
// effectiveBillingMode — המצב ה"אפקטיבי" של סליקת המטופלים לתצוגה
// ============================================================================
// `User.clinicBillingMode` יכול להיות null (legacy — טרם הוגדר במפורש). במצב
// זה resolveCardcomBilling מנתב לפי "מעדיף מסוף פרטי, אחרת מסוף הבעלים". כדי
// שמסכי הניהול (סליקה למטפלים + דוח ההכנסות) יציגו את אותו ניתוב בדיוק, אנו
// גוזרים: יש מסוף פרטי פעיל → OWN, אחרת → CLINIC. ערך מפורש (OWN/CLINIC) מוחזר
// כמו שהוא. כך התצוגה תמיד תואמת את ההתנהגות בפועל.
// ============================================================================

export type ClinicBillingModeValue = "CLINIC" | "OWN";

export function effectiveBillingMode(
  raw: string | null | undefined,
  hasActiveOwnCardcom: boolean
): ClinicBillingModeValue {
  if (raw === "OWN" || raw === "CLINIC") return raw;
  return hasActiveOwnCardcom ? "OWN" : "CLINIC";
}
