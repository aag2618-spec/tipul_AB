"use client";

// ──────────────────────────────────────────────────────────────────
// ReceiptToggle — תיבת "הוצא קבלה" המשותפת לכל מסכי רישום התשלום (שלב ב'
// של איחוד מסכי התשלום).
//
// לפני הרכיב הזה כל מסך (תשלום חדש / סמן כשולם / סימון מהיר / סיום פגישה /
// עדכון פגישה / תשלום חובות) החזיק עותק משלו של אותו בלוק JSX. התוצאה: דריפט —
// "הפק קבלה" מול "הוצא קבלה", הצגת "(ברירת מחדל)" בחלק מהמסכים בלבד, וכו'.
// מעכשיו הבלוק במקום אחד; שינוי ניסוח/התנהגות נעשה כאן בלבד.
//
// ⚠️ הרכיב פרזנטציוני בלבד — הוא לא טוען הגדרות עסק, לא קובע מה נשלח לשרת,
// ולא נוגע בזרימת קארדקום. כל מסך ממשיך להחזיק את ה-state (issueReceipt וכו')
// ואת לוגיקת השליחה שלו. הרכיב רק מרנדר את הבחירה ומדווח עליה דרך
// onIssueReceiptChange.
//
// הלוגיקה (זהה למקור בכל המסכים):
//   • businessType === "NONE"        → לא מציגים כלום (אין קבלות לעוסק שאינו רשום)
//   • אשראי + מסוף Cardcom פעיל       → הודעה ירוקה: קבלה תופק אוטומטית בסליקה
//   • receiptMode === "NEVER"         → לא מציגים (המטפל/ת כיבה קבלות כברירת מחדל)
//   • אחרת                            → checkbox "הוצא קבלה" (נעול ל-ON אם ALWAYS)
// ──────────────────────────────────────────────────────────────────

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";

interface ReceiptToggleProps {
  /** סוג העסק מ-business-settings: NONE / EXEMPT / LICENSED */
  businessType: string;
  /** ברירת מחדל לקבלה מ-business-settings: ALWAYS / ASK / NEVER */
  receiptMode: string;
  /** האם יש מסוף Cardcom פעיל (קבלה אוטומטית באשראי) */
  hasActiveCardcom: boolean;
  /** אמצעי התשלום הנבחר כרגע במסך */
  method: string;
  /** ערך ה-state במסך — האם להפיק קבלה */
  issueReceipt: boolean;
  /** עדכון ה-state במסך */
  onIssueReceiptChange: (checked: boolean) => void;
}

export function ReceiptToggle({
  businessType,
  receiptMode,
  hasActiveCardcom,
  method,
  issueReceipt,
  onIssueReceiptChange,
}: ReceiptToggleProps) {
  // useId מבטיח id ייחודי גם אם שני מסכים מרנדרים את הרכיב באותו עמוד.
  const checkboxId = useId();

  // עוסק שאינו רשום — אין קבלות בכלל.
  if (businessType === "NONE") return null;

  // אשראי דרך מסוף Cardcom פעיל — הכסף עובר דרכו והוא מפיק קבלה אוטומטית,
  // אז ה-checkbox מיותר ומוחלף בהודעה.
  if (method === "CREDIT_CARD" && hasActiveCardcom) {
    return (
      <div className="flex items-center gap-3 py-2 px-3 bg-green-50 rounded-lg border border-green-200">
        <FileText className="h-4 w-4 text-green-700" />
        <span className="text-sm text-green-800">
          קבלה תופק אוטומטית דרך קארדקום
        </span>
      </div>
    );
  }

  // המטפל/ת כיבה קבלות כברירת מחדל — לא מציגים את הבחירה.
  if (receiptMode === "NEVER") return null;

  // מזומן/העברה/צ'ק (או אשראי ידני ללא Cardcom) — המטפל/ת בוחר/ת.
  // stopPropagation מונע מלחיצה על התיבה להפעיל onClick של הורה (למשל ב-
  // pay-client-debts/quick-mark-paid הבלוק יושב באזור לחיץ). במסכים שאין בהם
  // הורה לחיץ זה no-op בטוח.
  return (
    <div
      className="flex items-center gap-3 py-2 px-3 bg-sky-50 rounded-lg border border-sky-200"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Checkbox
        id={checkboxId}
        checked={issueReceipt}
        onCheckedChange={(checked) => onIssueReceiptChange(checked === true)}
        disabled={receiptMode === "ALWAYS"}
      />
      <Label
        htmlFor={checkboxId}
        className="cursor-pointer flex items-center gap-2 text-sky-800"
      >
        <FileText className="h-4 w-4" />
        הוצא קבלה
        {receiptMode === "ALWAYS" && (
          <span className="text-xs text-sky-600">(ברירת מחדל)</span>
        )}
      </Label>
    </div>
  );
}
