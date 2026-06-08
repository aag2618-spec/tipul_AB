"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, Loader2, FileText, ChevronDown, ChevronUp, CreditCard, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ChargeCardcomDialog } from "@/components/payments/charge-cardcom-dialog";
import { ReceiptPreviewDialog } from "@/components/payments/receipt-preview-dialog";
import { tryOpenReceiptInNewTab, resolveReceiptToShow } from "@/lib/receipt-utils";
import { copayApplies } from "@/lib/commitments";

// New interface with session object
interface NewCompleteSessionDialogProps {
  session: {
    id: string;
    startTime: string;
    endTime: string;
    price: number;
    client: {
      id: string;
      name: string;
      creditBalance?: number;
    } | null;
  };
  onSuccess?: () => void;
  buttonText?: string;
}

// Legacy interface with individual props
interface LegacyCompleteSessionDialogProps {
  sessionId: string;
  clientId: string;
  clientName: string;
  sessionDate: string;
  defaultAmount: number;
  creditBalance?: number;
  hasNote?: boolean;
  hasPayment?: boolean;
  buttonText?: string;
}

type CompleteSessionDialogProps = NewCompleteSessionDialogProps | LegacyCompleteSessionDialogProps;

export function CompleteSessionDialog(props: CompleteSessionDialogProps) {
  // Support both new and legacy props
  const session = 'session' in props ? props.session : undefined;
  const onSuccess = 'onSuccess' in props ? props.onSuccess : undefined;
  const sessionId = session?.id || ('sessionId' in props ? props.sessionId : "");
  const clientId = session?.client?.id || ('clientId' in props ? props.clientId : "");
  const clientName = session?.client?.name || ('clientName' in props ? props.clientName : "");
  const sessionDate = session ? new Date(session.startTime).toLocaleString("he-IL") : ('sessionDate' in props ? props.sessionDate : "");
  const defaultAmount = session?.price || ('defaultAmount' in props ? props.defaultAmount : 0);
  const creditBalance = session?.client?.creditBalance || ('creditBalance' in props ? props.creditBalance || 0 : 0);
  const hasNote = 'hasNote' in props ? props.hasNote || false : false;
  const hasPayment = 'hasPayment' in props ? props.hasPayment || false : false;
  const buttonText = props.buttonText || "סיים מפגש";

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // CRITICAL: setIsLoading (state) הוא אסינכרוני — שני קליקים רצופים יכולים
  // שניהם לעבור את `if (isLoading)` לפני שה-state מתעדכן. useRef מתעדכן
  // סינכרונית ⇒ בלוק אטומי אמיתי. בלעדיו, יש סיכון תיאורטי ל-2 PUT על
  // אותה פגישה + 2 POST /api/payments (מוגן ברמת DB ע"י Payment.sessionId
  // @unique, אבל זה defense-in-depth ב-UI).
  const handleCompleteInFlightRef = useRef(false);
  const [summary, setSummary] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  // Cardcom flow — נפתח בנפרד אחרי שיצרנו Payment ב-PENDING. ה-paymentId נדרש
  // ל-ChargeCardcomDialog שאחראי על הסליקה האמיתית מול Cardcom.
  const [cardcomOpen, setCardcomOpen] = useState(false);
  const [cardcomPaymentId, setCardcomPaymentId] = useState<string | undefined>(undefined);
  const [cardcomAmount, setCardcomAmount] = useState<number>(0);
  // ── תצוגת קבלה in-page ───────────────────────────────────────
  // אחרי תשלום מוצלח (לא-Cardcom) פותחים דיאלוג עם iframe לקבלה,
  // עם כפתור הדפסה. ה-pendingNavigation נמתח עד שהמטפל סוגר את
  // הקבלה — מונע ניווט חטוף בזמן צפייה.
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);
  const [receiptIsCardcom, setReceiptIsCardcom] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const [amount, setAmount] = useState(defaultAmount.toString());
  const [includePayment, setIncludePayment] = useState(!hasPayment);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeCommitment, setActiveCommitment] = useState<{
    copaymentAmount: number | null;
    healthFund: string | null;
    approvedSessions: number | null;
    usedSessions: number;
  } | null>(null);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL" | "ADVANCE" | "CREDIT">("FULL");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [issueReceipt, setIssueReceipt] = useState<boolean>(false);
  const [receiptMode, setReceiptMode] = useState<"ALWAYS" | "ASK" | "NEVER">("ASK");
  const [businessType, setBusinessType] = useState<"NONE" | "EXEMPT" | "LICENSED">("NONE");
  const [externalReceiptProvider, setExternalReceiptProvider] = useState<string | null>(null);
  const router = useRouter();

  // ההשתתפות העצמית חלה רק כל עוד נותרו טיפולים מאושרים בהתחייבות;
  // מוצתה המכסה → מחיר הפגישה המלא.
  const effectiveAmount =
    activeCommitment?.copaymentAmount != null && copayApplies(activeCommitment)
      ? activeCommitment.copaymentAmount
      : defaultAmount;

  useEffect(() => {
    if (isOpen) {
      fetch("/api/user/business-settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.businessType) setBusinessType(data.businessType);
          if (data.receiptDefaultMode) setReceiptMode(data.receiptDefaultMode);
          setExternalReceiptProvider(data.externalReceiptProvider ?? null);
          if (data.externalReceiptProvider === "CARDCOM") setIssueReceipt(true);
          else if (data.receiptDefaultMode === "ALWAYS") setIssueReceipt(true);
          else if (data.receiptDefaultMode === "NEVER") setIssueReceipt(false);
        })
        .catch(() => {});

      if (clientId) {
        fetch(`/api/clients/${clientId}/commitments`)
          .then((res) => res.ok ? res.json() : [])
          .then((commitments: Array<{ status: string; copaymentAmount: number | null; approvedSessions: number | null; usedSessions: number }>) => {
            const active = commitments.find((c: { status: string }) => c.status === "ACTIVE");
            if (active) {
              fetch(`/api/clients/${clientId}?fields=basic`)
                .then((res) => res.ok ? res.json() : null)
                .then((clientData: { healthFund?: string } | null) => {
                  setActiveCommitment({
                    copaymentAmount: active.copaymentAmount != null ? Number(active.copaymentAmount) : null,
                    healthFund: clientData?.healthFund || null,
                    approvedSessions: active.approvedSessions,
                    usedSessions: active.usedSessions,
                  });
                  // ממלאים מראש את ההשתתפות העצמית רק כל עוד נותרו טיפולים
                  // מאושרים; נגמרה המכסה → ברירת המחדל היא מחיר הפגישה המלא.
                  setAmount(
                    copayApplies({
                      copaymentAmount:
                        active.copaymentAmount != null ? Number(active.copaymentAmount) : null,
                      approvedSessions: active.approvedSessions,
                      usedSessions: active.usedSessions,
                    })
                      ? Number(active.copaymentAmount).toString()
                      : defaultAmount.toString()
                  );
                })
                .catch(() => {
                  setActiveCommitment({
                    copaymentAmount: active.copaymentAmount != null ? Number(active.copaymentAmount) : null,
                    healthFund: null,
                    approvedSessions: active.approvedSessions,
                    usedSessions: active.usedSessions,
                  });
                  // ממלאים מראש את ההשתתפות העצמית רק כל עוד נותרו טיפולים
                  // מאושרים; נגמרה המכסה → ברירת המחדל היא מחיר הפגישה המלא.
                  setAmount(
                    copayApplies({
                      copaymentAmount:
                        active.copaymentAmount != null ? Number(active.copaymentAmount) : null,
                      approvedSessions: active.approvedSessions,
                      usedSessions: active.usedSessions,
                    })
                      ? Number(active.copaymentAmount).toString()
                      : defaultAmount.toString()
                  );
                });
            } else {
              setActiveCommitment(null);
            }
          })
          .catch(() => setActiveCommitment(null));
      }
    }
  }, [isOpen, clientId, defaultAmount]);

  const handleComplete = async () => {
    // mutex סינכרוני — מונע race של שני קליקים בו-זמנית. לבדוק לפני
    // setIsLoading (אסינכרוני).
    if (handleCompleteInFlightRef.current) {
      return;
    }
    handleCompleteInFlightRef.current = true;
    setIsLoading(true);
    try {
      let actualAmount = parseFloat(amount);
      let actualPaymentType: "FULL" | "PARTIAL" | "ADVANCE" = "FULL";
      let creditToUse = 0;

      if (paymentType === "PARTIAL") {
        actualAmount = parseFloat(partialAmount) || 0;
        actualPaymentType = "PARTIAL";
        if (actualAmount <= 0 || actualAmount > effectiveAmount) {
          toast.error("סכום חלקי לא תקין");
          setIsLoading(false);
          return;
        }
      } else if (paymentType === "CREDIT") {
        if (creditBalance < effectiveAmount) {
          toast.error("אין מספיק קרדיט");
          setIsLoading(false);
          return;
        }
        creditToUse = actualAmount;
      } else if (paymentType === "ADVANCE") {
        actualPaymentType = "ADVANCE";
        actualAmount = parseFloat(partialAmount) || 0;
      }

      // ── Cardcom intercept ─────────────────────────────────────
      // אם אמצעי התשלום הוא כרטיס אשראי — חייבים לבצע סליקה אמיתית דרך Cardcom
      // ולא לרשום PAID ידנית. חריגים שחוסמים:
      //   • CREDIT (משיכה מקרדיט) — לא משתמש בכרטיס בכלל.
      //   • ADVANCE (טעינת קרדיט) — createPaymentForSession מגדיל את
      //     client.creditBalance מיידית גם ב-PENDING. אם Cardcom ייכשל,
      //     הקרדיט כבר נוסף → סנכרון שבור. עד שננתק את הגדלת הקרדיט
      //     לאירוע PAID בלבד, חוסמים ADVANCE + אשראי.
      //   • PARTIAL — createPaymentForSession יוצר child PAID מיידית עבור
      //     הסכום החלקי גם כשהאב ב-PENDING. אם Cardcom ייכשל יישאר child
      //     PAID זומבי. בנוסף ה-webhook מסמן PAID בלי לבדוק amount==expected,
      //     מה שמשאיר חוב מובלע. נחסום עד תיקון מקיף של ה-flow.
      if (
        paymentMethod === "CREDIT_CARD" &&
        paymentType !== "CREDIT" &&
        paymentType !== "ADVANCE"
      ) {
        // לפני פתיחת Cardcom: מסמנים את הפגישה כ-COMPLETED. אם המשתמש יסגור
        // את הדיאלוג באמצע הסליקה, הפגישה כבר תהיה במצב נכון — ה-Payment פשוט
        // יישאר PENDING (חוב גלוי בהיסטוריה) ולא תיוצר חוסר עקביות.
        try {
          await fetch(`/api/sessions/${sessionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "COMPLETED" }),
          });
        } catch (sessErr) {
          // אם עדכון הפגישה נכשל לא ממשיכים — אחרת נישאר עם Payment בלי פגישה.
          toast.error("עדכון סטטוס הפגישה נכשל. נסה שוב.");
          console.error(sessErr);
          return;
        }

        // יוצרים Payment ב-PENDING (Cardcom יעדכן ל-PAID דרך webhook).
        // ⚠️ ב-PARTIAL: expectedAmount הוא מחיר הפגישה המלא (defaultAmount)
        // כדי שהמערכת תזהה שיש יתרה. ה-webhook יחשב status=PAID רק
        // כשהסכום המצטבר >= expected. ב-FULL: expectedAmount=actualAmount.
        const expectedForPost =
          actualPaymentType === "PARTIAL" ? effectiveAmount : actualAmount;
        const paymentRes = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            sessionId,
            amount: actualAmount,
            expectedAmount: expectedForPost,
            paymentType: actualPaymentType,
            method: "CREDIT_CARD",
            status: "PENDING",
            // הקבלה תופק ע״י Cardcom Documents API ב-webhook — לא ידנית כאן.
            issueReceipt: false,
          }),
        });
        if (!paymentRes.ok) throw new Error("יצירת רישום תשלום נכשלה");
        const paymentResult = (await paymentRes.json()) as { id: string };
        setCardcomPaymentId(paymentResult.id);
        setCardcomAmount(actualAmount);
        // סוגרים את הדיאלוג הראשי ומאפשרים לאנימציה של Radix לסיים לפני
        // פתיחת הדיאלוג השני (~220ms = משך אנימציית סגירה).
        setIsOpen(false);
        setTimeout(() => setCardcomOpen(true), 220);
        return;
      }

      // ADVANCE + אשראי לא נתמך עדיין (ראו הערה למעלה).
      if (paymentMethod === "CREDIT_CARD" && paymentType === "ADVANCE") {
        toast.error(
          "טעינת קרדיט באשראי טרם נתמכת ב-Cardcom. בחרי אמצעי תשלום אחר (מזומן/העברה) לטעינת קרדיט."
        );
        setIsLoading(false);
        return;
      }

      // PARTIAL + אשראי נתמך כעת: createPaymentForSession + prepareCardcom
      // יוצרים child PENDING באשראי כשהורה ב-PARTIAL. ה-webhook מודע לחלקי
      // וקובע status נכון (PAID רק כשעמוד>=expected). ראו את הזרמים החלקיים
      // ב-payment-creator.ts, prepareCardcom additive ב-/api/payments/[id],
      // ו-webhook ב-/api/webhooks/cardcom/user.

      // Step 1: Create payment first (with receipt)
      const paymentRes = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          sessionId: paymentType === "ADVANCE" ? null : sessionId,
          amount: actualAmount,
          expectedAmount: paymentType === "PARTIAL" ? effectiveAmount : undefined,
          paymentType: actualPaymentType,
          method: paymentType === "CREDIT" ? "CREDIT" : paymentMethod,
          status: paymentType === "PARTIAL" ? undefined : "PAID",
          issueReceipt: businessType !== "NONE" && issueReceipt,
          creditUsed: creditToUse > 0 ? creditToUse : undefined,
        }),
      });

      if (!paymentRes.ok) throw new Error("Payment failed");
      const paymentResult = await paymentRes.json();

      // Step 2: Update session status (payment already exists, session PUT will find it and skip)
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      if (paymentResult?.receiptError) {
        toast.error(`שגיאה בהפקת קבלה: ${paymentResult.receiptError}`, { duration: 8000 });
      }

      toast.success("המפגש הושלם בהצלחה!");
      setSummary("");
      setShowAdvanced(false);
      setPaymentType("FULL");
      setPartialAmount("");

      // ── הצגת קבלה אחרי תשלום (מזומן/העברה/צ'ק/קרדיט/אחר) ────
      // המטפל ביקש: הקבלה תיפתח בלשונית/דף אינטרנטי נפרד — לא רק
      // בדיאלוג מודאלי. ה-click על "סיים מפגש" עדיין נחשב user-gesture
      // כשה-fetch מסתיים מהר (פחות מ-1s לתשלומים שאינם Cardcom),
      // ולכן window.open לא ייחסם ע"י popup-blockers ברוב המקרים.
      // אם בכל זאת נחסם — fallback לדיאלוג in-page (התנהגות הקודמת).
      const navigateAfter = () => {
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(`/dashboard/sessions/${sessionId}`);
        }
      };
      // ── מתי מציגים את הקבלה מיד? ─────────────────────────────────
      // לפי מה שה-שרת באמת הפיק (receiptUrl/receiptNumber), ולא לפי הדגלים
      // המקומיים businessType/issueReceipt. כש-Cardcom/פלבק-קליניקה מנפיק את
      // הקבלה (או EXEMPT עם הפקה אוטומטית) השרת מפיק קבלה גם כשהדגל המקומי
      // כבוי — והגייט הישן הסתיר אותה עד הכניסה לטאב "קבלות". כעת מציגים
      // מיד, בדיוק כמו ב-quick-mark-paid ובתשלום חלקי.
      const shown = resolveReceiptToShow(
        paymentResult as {
          receiptUrl?: string | null;
          receiptNumber?: string | null;
        },
      );
      const receiptUrl = shown?.receiptUrl ?? undefined;
      if (paymentResult?.id && shown) {
        const { opened: popupOpened } = tryOpenReceiptInNewTab(receiptUrl);
        if (popupOpened) {
          toast.message("הקבלה נפתחה בלשונית חדשה — אפשר להדפיס משם", {
            duration: 5000,
          });
          setIsOpen(false);
          navigateAfter();
          return;
        }
        // Fallback: popup-blocker חסם או receiptUrl חסר/לא תקין.
        pendingNavigationRef.current = navigateAfter;
        setReceiptPaymentId(paymentResult.id);
        setReceiptIsCardcom(shown.isCardcom);
        if (!receiptUrl) {
          toast.message("הקבלה תיפתח כאן ברגע שתהיה מוכנה", { duration: 4000 });
        } else {
          toast.message(
            "הדפדפן חסם פתיחת לשונית. הקבלה מוצגת כאן — או אשר/י popups בהגדרות הדפדפן.",
            { duration: 8000 },
          );
        }
        setIsOpen(false);
        setTimeout(() => setReceiptOpen(true), 220);
        return;
      }
      setIsOpen(false);
      navigateAfter();
    } catch (error) {
      toast.error("שגיאה בסיום המפגש");
      console.error(error);
    } finally {
      setIsLoading(false);
      // ⚠️ חיוני: בלי איפוס ה-ref, לחיצה אחת על "סיים פגישה" תחסום
      // לצמיתות את הכפתור (גם אחרי שגיאה או הצלחה רגילה). חוץ מהמסלול
      // שפותח Cardcom-dialog ועושה setIsOpen(false) — בו ה-component יישלף
      // ויאופס מאליו, אז גם אם נאפס פה זה לא מזיק.
      handleCompleteInFlightRef.current = false;
    }
  };

  // נקרא רק אחרי תשלום מוצלח של Cardcom (webhook עדכן את ה-Payment ל-PAID).
  // עכשיו מסיימים את המפגש (אם זה לא ADVANCE שלא קשור לפגישה ספציפית).
  const handleCardcomSuccess = async (): Promise<void> => {
    // הפגישה כבר סומנה COMPLETED לפני פתיחת Cardcom (ראה handleComplete),
    // לכן כאן רק מנקים סטייט, מציגים הודעה ומנווטים. ה-Payment עבר ל-PAID
    // אוטומטית דרך ה-webhook של Cardcom — לא צריך עדכון ידני נוסף.
    toast.success("המפגש הושלם והתשלום נסלק בהצלחה!");
    setSummary("");
    setShowAdvanced(false);
    setPaymentType("FULL");
    setPartialAmount("");
    if (onSuccess) {
      onSuccess();
    } else if (sessionId) {
      router.push(`/dashboard/sessions/${sessionId}`);
    }
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className="gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            סיום מפגש - {clientName}
          </DialogTitle>
          <DialogDescription>
            <div>{sessionDate}</div>
            {creditBalance > 0 && (
              <Badge variant="secondary" className="mt-1">
                קרדיט זמין: ₪{creditBalance}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* כפתור סיום ללא תשלום */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full font-bold text-base"
              onClick={async () => {
                setIsLoading(true);
                try {
                  await fetch(`/api/sessions/${sessionId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "COMPLETED" }),
                  });
                  toast.success("המפגש הושלם ללא תשלום");
                  setIsOpen(false);
                  
                  // Call onSuccess callback if provided, otherwise navigate
                  if (onSuccess) {
                    onSuccess();
                  } else {
                    router.push(`/dashboard/sessions/${sessionId}`);
                  }
                } catch {
                  toast.error("שגיאה בסיום המפגש");
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
            >
              סיום ללא תשלום
            </Button>
          </div>

          {/* תשלום */}
          {!hasPayment && (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-bold">סיום ותשלום 💰</Label>
              </div>

              {activeCommitment && activeCommitment.copaymentAmount != null && (
                copayApplies(activeCommitment) ? (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Stethoscope className="h-4 w-4 text-blue-700 shrink-0" />
                    <div className="text-sm text-blue-800">
                      <span className="font-semibold">
                        קופת חולים: {{ CLALIT: "כללית", MACCABI: "מכבי", MEUHEDET: "מאוחדת", LEUMIT: "לאומית" }[activeCommitment.healthFund || ""] || "לא צוינה"}
                      </span>
                      <span className="mx-1">|</span>
                      <span>השתתפות עצמית: ₪{activeCommitment.copaymentAmount}</span>
                      {activeCommitment.approvedSessions != null && (
                        <>
                          <span className="mx-1">|</span>
                          <span>טיפולים: {activeCommitment.usedSessions}/{activeCommitment.approvedSessions}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <Stethoscope className="h-4 w-4 text-amber-700 shrink-0" />
                    <div className="text-sm text-amber-800">
                      <span className="font-semibold">נוצלו כל הטיפולים בהתחייבות ({activeCommitment.usedSessions}/{activeCommitment.approvedSessions})</span>
                      <span className="mx-1">|</span>
                      <span>חיוב מלא: ₪{defaultAmount}</span>
                    </div>
                  </div>
                )
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">סכום</Label>
                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-8"
                      disabled={paymentType !== "FULL"}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ₪
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="method">אמצעי תשלום</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">מזומן</SelectItem>
                      <SelectItem value="CREDIT_CARD">אשראי</SelectItem>
                      <SelectItem value="BANK_TRANSFER">העברה</SelectItem>
                      <SelectItem value="CHECK">צ׳ק</SelectItem>
                      <SelectItem value="OTHER">אחר</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* הוצאת קבלה */}
              {businessType !== "NONE" && receiptMode !== "NEVER" && (
                externalReceiptProvider === "CARDCOM" ? (
                  <div className="flex items-center gap-3 py-2 px-3 bg-green-50 rounded-lg border border-green-200">
                    <FileText className="h-4 w-4 text-green-700" />
                    <span className="text-sm text-green-800">
                      קבלה תופק אוטומטית דרך קארדקום
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-2 px-3 bg-sky-50 rounded-lg border border-sky-200">
                    <Checkbox
                      id="issue-receipt-complete"
                      checked={issueReceipt}
                      onCheckedChange={(checked) => setIssueReceipt(checked === true)}
                      disabled={receiptMode === "ALWAYS"}
                    />
                    <Label htmlFor="issue-receipt-complete" className="cursor-pointer flex items-center gap-2 text-sky-800">
                      <FileText className="h-4 w-4" />
                      הוצא קבלה
                      {receiptMode === "ALWAYS" && (
                        <span className="text-xs text-sky-600">(ברירת מחדל)</span>
                      )}
                    </Label>
                  </div>
                )
              )}

              {/* Advanced Options */}
              <div className="space-y-3">
                <Button 
                  type="button"
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-between font-semibold"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <span className="font-bold">אופציות מתקדמות</span>
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                    {showAdvanced && (
                      <div className="space-y-2 pt-2">
                        <div className="grid gap-2">
                          <Button
                            type="button"
                            variant={paymentType === "FULL" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPaymentType("FULL")}
                          >
                            תשלום מלא (₪{effectiveAmount})
                          </Button>
                          
                          {creditBalance >= effectiveAmount && (
                            <Button
                              type="button"
                              variant={paymentType === "CREDIT" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPaymentType("CREDIT")}
                            >
                              משיכה מקרדיט (₪{creditBalance} זמין)
                            </Button>
                          )}
                          
                          <Button
                            type="button"
                            variant={paymentType === "PARTIAL" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPaymentType("PARTIAL")}
                          >
                            תשלום חלקי
                          </Button>
                          
                          {paymentType === "PARTIAL" && (
                            <div className="pr-4 space-y-1">
                              <Input
                                type="number"
                                placeholder="הכנס סכום"
                                value={partialAmount}
                                onChange={(e) => setPartialAmount(e.target.value)}
                                max={effectiveAmount}
                                min={0}
                                step="0.01"
                              />
                              {partialAmount && parseFloat(partialAmount) < effectiveAmount && (
                                <p className="text-xs text-muted-foreground">
                                  נותר לתשלום: ₪{effectiveAmount - parseFloat(partialAmount)}
                                </p>
                              )}
                            </div>
                          )}
                          
                          <Button
                            type="button"
                            variant={paymentType === "ADVANCE" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPaymentType("ADVANCE")}
                          >
                            תשלום מראש (הוספה לקרדיט)
                          </Button>
                          
                          {paymentType === "ADVANCE" && (
                            <div className="pr-4">
                              <Input
                                type="number"
                                placeholder="הכנס סכום לקרדיט"
                                value={partialAmount}
                                onChange={(e) => setPartialAmount(e.target.value)}
                                min={0}
                                step="0.01"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

          {hasNote && (
            <p className="text-sm text-muted-foreground">
              ✓ למפגש זה כבר יש סיכום
            </p>
          )}

          {hasPayment && (
            <p className="text-sm text-muted-foreground">
              ✓ תשלום כבר נרשם למפגש זה
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
            className="font-medium"
          >
            ביטול
          </Button>
          {!hasPayment && (
            <Button 
              onClick={handleComplete} 
              disabled={isLoading}
              className="gap-2 font-bold bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שומר...
                </>
              ) : paymentMethod === "CREDIT_CARD" && paymentType !== "CREDIT" ? (
                <>
                  <CreditCard className="h-4 w-4" />
                  המשך לסליקה ב-Cardcom
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  סיום ושלם
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ChargeCardcomDialog
      open={cardcomOpen}
      onOpenChange={setCardcomOpen}
      paymentId={cardcomPaymentId}
      sessionId={sessionId}
      clientId={clientId}
      clientName={clientName ?? "מטופל"}
      amount={cardcomAmount}
      defaultDescription={`פגישה`}
      onPaymentSuccess={handleCardcomSuccess}
    />

    {/* תצוגת קבלה in-page — נפתח אחרי תשלום מוצלח (לא-Cardcom).
        כש-onOpenChange(false) → מבצע את הניווט שנדחה.
        ⚠️ Cardcom מטופל בתוך ChargeCardcomDialog עצמו (המקום היחיד
        שמכיר את התזמון של ה-webhook), לא כאן. */}
    <ReceiptPreviewDialog
      open={receiptOpen}
      onOpenChange={(next) => {
        setReceiptOpen(next);
        if (!next) {
          const nav = pendingNavigationRef.current;
          pendingNavigationRef.current = null;
          if (nav) nav();
        }
      }}
      paymentId={receiptPaymentId}
      isCardcom={receiptIsCardcom}
    />
    </>
  );
}
