"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Repeat, Settings, Waves, UserPlus, ArrowRight, AlertTriangle, Search, Users, Check } from "lucide-react";
import { format, addWeeks } from "date-fns";
import { toast } from "sonner";
import type { CalendarClient, CalendarSession } from "@/hooks/use-calendar-data";
import { useMyPermissions } from "@/hooks/use-my-permissions";

// Phase 3: רשימת מטפלי הקליניקה ל-picker בפגישת ייעוץ (מטופל מהיר).
// אנלוג לטיפוס ב-/dashboard/clients/new. ה-endpoint /api/clinic/therapists
// מסנן SECRETARY, אז נשארים רק 2 ה-roles. email יכול להיות null ב-User.
interface ClinicTherapistOption {
  id: string;
  name: string | null;
  email: string | null;
  clinicRole: "OWNER" | "THERAPIST";
}

// שלב 2 (חדרים): אפשרות חדר לבורר. מגיע מ-/api/clinic/rooms (ריק למטפל/ת עצמאי/ת).
interface ClinicRoomOption {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

// ── Types ──

export interface SessionFormData {
  clientId: string;
  startTime: string;
  endTime: string;
  type: string;
  price: string;
  topic: string;
  isRecurring: boolean;
  weeksToRepeat: number;
  // Phase 1 (סבב 21): מיקום הפגישה. בקליניקה רב-מטפלית זה משמש את
  // findClinicLocationConflict לאיתור double-booking על אותו חדר.
  // אם השדה ריק — לא נבדקת חפיפת חדר (התנהגות תאימות).
  location: string;
  // "מצא משבצת פנויה": בחירה-מראש של מטפל/חדר מהמשבצת שנבחרה. אופציונלי —
  // שאר נקודות-הכניסה (DEFAULT / קבע-אחרי / במקביל) משאירות undefined,
  // ואז המטפל נגזר מהמטופל כמו קודם והחדר נפתח ריק (תאימות לאחור).
  therapistId?: string;
  roomId?: string;
}

export interface RecurringPreviewItem {
  key: string;
  date: string;
  time: string;
  clientName: string;
  clientId: string;
  patternId: string;
  status: "ok" | "conflict";
  // שלב 2 (חדרים): roomName מצוין רק כשההתנגשות היא על *החדר שנבחר* (אותו roomId),
  // כדי שהתצוגה המקדימה של הסדרה תבהיר "החדר תפוס" בדיוק כמו בפגישה בודדת.
  conflictWith?: { id: string; clientName: string; startTime: string; endTime: string; roomName?: string | null };
}

export interface PendingFormRecurring {
  clientId: string;
  type: string;
  price: string;
  topic: string;
  // Phase 1 (סבב 21): מיקום משותף לכל הפגישות בסדרה החוזרת — נשלח ל-/api/sessions
  // POST כדי שבדיקת חפיפת חדר תרוץ. אופציונלי לתאימות לאחור.
  location?: string;
  // יומן רב-מטפלים: המטפל היעד לכל הסדרה. נשלח ל-/api/sessions POST כדי
  // שהסדרה תיווצר אצל המטפל שנבחר (לא אצל המטפל הקבוע של המטופל). ריק/undefined
  // → השרת פותר לפי המטופל (התנהגות קיימת).
  therapistId?: string;
  // שלב 2 (חדרים): החדר היעד לכל הסדרה (FK). ריק → ללא חדר.
  roomId?: string;
  sessions: Array<{ startTime: string; endTime: string }>;
}

export const DEFAULT_FORM_DATA: SessionFormData = {
  clientId: "",
  startTime: "",
  endTime: "",
  type: "IN_PERSON",
  price: "",
  topic: "",
  isRecurring: false,
  weeksToRepeat: 4,
  location: "",
};

// ── Props ──

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: CalendarClient[];
  defaultSessionDuration: number;
  /**
   * מחיר ברירת מחדל לטיפול מהגדרות המטפל. משמש כשנבחר מטופל ללא מחיר
   * אישי משלו. null = לא הוגדר בהגדרות.
   */
  defaultSessionPrice?: number | null;
  selectedDate: Date | null;
  initialFormData: SessionFormData;
  sessions: CalendarSession[];
  onSessionCreated: () => void;
  onShowRecurringPreview: (
    preview: RecurringPreviewItem[],
    decisions: Record<string, "skip" | "replace" | "create">,
    pendingRecurring: PendingFormRecurring
  ) => void;
}

// שם משפחה = המילה האחרונה אחרי רווח. אם השם הוא מילה אחת — היא תשמש כשם משפחה.
// קידומות נפוצות לשמות משפחה (במיוחד לקהל חרדי): "בן דוד", "בר אילן", "הלוי", "דה לה" וכו'.
const SURNAME_PREFIXES = new Set(["בן", "בר", "אבן", "הלוי", "הכהן", "דה", "אל", "אבו", "ابن", "بن"]);

// מחזיר את אורך החלק האחרון של השם המשמש כשם משפחה — 1 לרוב המקרים,
// 2 כשיש קידומת ("בן דוד" = 2 מילים).
function lastNameWordCount(parts: string[]): number {
  if (parts.length >= 2 && SURNAME_PREFIXES.has(parts[parts.length - 2])) return 2;
  return 1;
}

function getLastName(fullName: string): string {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  const count = lastNameWordCount(parts);
  return parts.slice(parts.length - count).join(" ");
}

// מציג את השם בסדר "שם משפחה ושם פרטי" — למשל "בן דוד ישראל".
// אם השם מילה אחת — מוחזר כמו שהוא.
function formatNameLastFirst(fullName: string): string {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  const count = lastNameWordCount(parts);
  const lastName = parts.slice(parts.length - count).join(" ");
  const firstName = parts.slice(0, parts.length - count).join(" ");
  return firstName ? `${lastName} ${firstName}` : lastName;
}

// ── Component ──

export function NewSessionDialog({
  open,
  onOpenChange,
  clients,
  defaultSessionDuration,
  defaultSessionPrice,
  selectedDate,
  initialFormData,
  sessions,
  onSessionCreated,
  onShowRecurringPreview,
}: NewSessionDialogProps) {
  const [formData, setFormData] = useState<SessionFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDurationCustomizer, setShowDurationCustomizer] = useState(false);
  const [customDuration, setCustomDuration] = useState(defaultSessionDuration);

  // חיפוש מטופל — מסנן את רשימת המטופלים. clientListOpen קובע אם הרשימה
  // מוצגת (בפוקוס/הקלדה) או מכווצת (במצב הפתיחה הראשוני ואחרי בחירה),
  // כדי לא להציג את כל המטופלים מיד עם פתיחת הדיאלוג.
  const [clientSearch, setClientSearch] = useState("");
  const [clientListOpen, setClientListOpen] = useState(false);

  // פגישת ייעוץ — state
  const [isQuickClientMode, setIsQuickClientMode] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");
  const [quickClientPhone, setQuickClientPhone] = useState("");
  const [quickClientEmail, setQuickClientEmail] = useState("");
  const [matchedClient, setMatchedClient] = useState<CalendarClient | null>(null);

  // Phase 3: picker מטפל אחראי בפגישת ייעוץ (מטופל מהיר). הוצג רק
  // ל-OWNER/SECRETARY בקליניקה. ל-THERAPIST/עצמאי אין picker — resolver בשרת
  // ייקח self. למזכירה זה חובה (אחרת היא הופכת ל-"מטפלת אחראית").
  const myPermissions = useMyPermissions();
  const canPickTherapist =
    myPermissions.clinicRole === "OWNER" || myPermissions.clinicRole === "SECRETARY";
  const [clinicTherapists, setClinicTherapists] = useState<ClinicTherapistOption[]>([]);
  const [loadingTherapists, setLoadingTherapists] = useState(false);
  const [pickedTherapistId, setPickedTherapistId] = useState<string>("");

  // שלב 2 (חדרים): רשימת חדרי הקליניקה + החדר הנבחר. ה-GET מחזיר [] למטפל/ת
  // עצמאי/ת, ולכן הבורר לא יוצג והשדה הטקסטואלי (location) נשאר כמו היום.
  const [clinicRooms, setClinicRooms] = useState<ClinicRoomOption[]>([]);
  const [pickedRoomId, setPickedRoomId] = useState<string>("");

  // התנגשות בפגישה בודדת — state
  const [conflictPrompt, setConflictPrompt] = useState<{
    conflicts: Array<{ id: string; clientName: string; startTime: string; endTime: string; therapistName?: string | null; roomName?: string | null }>;
    pendingPayload: {
      clientId: string;
      startTime: string;
      endTime: string;
      type: string;
      price: number;
      topic: string | undefined;
      // Phase 1 (סבב 21): חייב להיות בטיפוס כדי להעביר אותו הלאה
      // ל-submitSingleSession בעת replace/allowOverlap. במציאות תמיד
      // נשלח (כי ה-payload המקורי כולל אותו) — זו רק התאמת טיפוס.
      location: string | undefined;
      // יומן רב-מטפלים: המטפל היעד. נשמר ב-payload כדי שבחירת replace/allowOverlap
      // תיצור את הפגישה אצל המטפל הנכון.
      therapistId: string | undefined;
      // שלב 2 (חדרים): מזהה החדר הנבחר — נשמר כדי ש-replace/allowOverlap ייצרו
      // את הפגישה באותו חדר.
      roomId: string | undefined;
    };
  } | null>(null);
  const [conflictDecision, setConflictDecision] = useState<"replace" | "create">("replace");

  // בורר מטפל (יומן רב-מטפלים): ברירת מחדל למטפל הקבוע של המטופל שכבר נבחר
  // ב-initialFormData (פתיחה מ"קבע במקביל" / מדף מטופל). נגזר כ**מחרוזת יציבה**
  // ולא דרך reference של מערך `clients`, כדי שרענון רשימת המטופלים תוך כדי
  // שהדיאלוג פתוח לא יפעיל את אפקט האיפוס וידרוס את הטופס בעריכה.
  const initialClientTherapistId =
    clients.find((c) => c.id === initialFormData.clientId)?.therapistId || "";

  // Reset internal state when dialog opens with new initial data
  useEffect(() => {
    if (open) {
      setFormData(initialFormData);
      setCustomDuration(defaultSessionDuration);
      setShowDurationCustomizer(false);
      setIsSubmitting(false);
      setIsQuickClientMode(false);
      setQuickClientName("");
      setQuickClientPhone("");
      setQuickClientEmail("");
      setMatchedClient(null);
      setConflictPrompt(null);
      setConflictDecision("replace");
      setClientSearch("");
      setClientListOpen(false);
      // "מצא משבצת פנויה" יכול להעביר מטפל/חדר מהמשבצת שנבחרה; אחרת ברירת
      // המחדל היא המטפל הקבוע של המטופל (כמו קודם).
      setPickedTherapistId(initialFormData.therapistId || initialClientTherapistId);
      // שלב 2 (חדרים): ברירת מחדל ללא חדר — אלא אם "מצא משבצת" העביר חדר ספציפי.
      setPickedRoomId(initialFormData.roomId || "");
    }
  }, [open, initialFormData, defaultSessionDuration, initialClientTherapistId]);

  // Phase 3: טעינת רשימת מטפלי הקליניקה רק ל-OWNER/SECRETARY (כשהדיאלוג פתוח).
  // ה-API מחזיר 403 ל-THERAPIST/עצמאי, אז פשוט לא קוראים אותו אצלם. toast.error
  // על non-OK / catch — להבדיל בין רשימה ריקה אמיתית (אין מטפלים פעילים)
  // לבין כשל רשת/שרת. הגנה כפולה: ה-endpoint כבר מסונן ב-server-side.
  useEffect(() => {
    if (!open || !canPickTherapist) return;
    let cancelled = false;
    setLoadingTherapists(true);
    fetch("/api/clinic/therapists", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setClinicTherapists([]);
          toast.error("שגיאה בטעינת רשימת המטפלים");
          return;
        }
        const data = (await res.json()) as ClinicTherapistOption[];
        if (cancelled) return;
        setClinicTherapists(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setClinicTherapists([]);
          toast.error("שגיאה בטעינת רשימת המטפלים");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTherapists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canPickTherapist]);

  // שלב 2 (חדרים): טעינת חדרי הקליניקה כשהדיאלוג נפתח. נגיש לכל חבר/ת קליניקה;
  // למטפל/ת עצמאי/ת מוחזר [] (אין קליניקה) ולכן הבורר פשוט לא יוצג.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/clinic/rooms", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (!cancelled) setClinicRooms(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // שקט — בלי חדרים הבורר לא יוצג, השדה הטקסטואלי נשאר.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // רשימת מטופלים קבועים, ממוינת לפי שם משפחה (א"ב) ומסוננת לפי החיפוש.
  // החיפוש מתאים גם בשם פרטי וגם בשם משפחה — לפי קלט כלשהו של המשתמש.
  // המטופל הנבחר נשאר ברשימה תמיד — אחרת Radix Select יציג placeholder.
  const sortedFilteredClients = useMemo(() => {
    const regular = clients.filter((c) => !c.isQuickClient);
    const collator = new Intl.Collator("he", { sensitivity: "base", numeric: true });
    const sorted = [...regular].sort((a, b) => {
      const lastA = getLastName(a.name);
      const lastB = getLastName(b.name);
      const byLast = collator.compare(lastA, lastB);
      if (byLast !== 0) return byLast;
      return collator.compare(a.name || "", b.name || "");
    });

    const term = clientSearch.trim().toLowerCase();
    if (!term) return sorted;
    // התאמה גם לפורמט המקורי ("ישראל בן דוד") וגם לפורמט התצוגה
    // ("בן דוד ישראל"), כדי שהמשתמש יוכל להקליד בכל סדר.
    const filtered = sorted.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const reordered = formatNameLastFirst(c.name || "").toLowerCase();
      return name.includes(term) || reordered.includes(term);
    });
    // אם החיפוש סינן החוצה את המטופל הנבחר — מוסיפים אותו חזרה כדי
    // שה-Select ימשיך להציג את שמו ב-Trigger.
    if (formData.clientId && !filtered.some((c) => c.id === formData.clientId)) {
      const selected = sorted.find((c) => c.id === formData.clientId);
      if (selected) return [selected, ...filtered];
    }
    return filtered;
  }, [clients, clientSearch, formData.clientId]);

  // המטופל שנבחר כרגע — מוצג כשהרשימה מכווצת (במקום כל הרשימה).
  const pickedClient = clients.find((c) => c.id === formData.clientId) ?? null;

  // יומן רב-מטפלים: בורר מטפל בטופס הרגיל מוצג רק לבעלים/מזכירה בקליניקה עם
  // יותר ממטפל אחד. למטפל יחיד / עצמאי אין picker — והכל מתנהג כמו היום.
  const isMultiTherapistClinic = clinicTherapists.length > 1;
  // המטפל היעד של הפגישה: בחירה מפורשת בבורר > המטפל הקבוע של המטופל. null אם לא ידוע.
  // בהפסקה (BREAK) אין מטפל יעד נבחר — מתעלמים מהבורר ונופלים להתנהגות הקיימת
  // (בדיקת חפיפה מול כל הפגישות הטעונות), כך שהפסקה לא "תיגנב" למטפל אחר.
  const targetTherapistId =
    formData.type === "BREAK"
      ? null
      : (canPickTherapist && pickedTherapistId) || pickedClient?.therapistId || null;
  // שם המטפל/ת הקבוע/ה של המטופל הנבחר — לחיווי "ממלא מקום" כשבוחרים מטפל אחר.
  const clientPrimaryTherapistName =
    clinicTherapists.find((t) => t.id === pickedClient?.therapistId)?.name ?? null;

  // שלב 2 (חדרים): רק חדרים פעילים בבורר; החדר הנבחר; ומזהה החדר היעד לבדיקת
  // חפיפת חדר (לא בהפסקה).
  const activeRooms = clinicRooms.filter((r) => r.isActive);
  const pickedRoom = activeRooms.find((r) => r.id === pickedRoomId) ?? null;
  const targetRoomId = formData.type === "BREAK" ? null : pickedRoomId || null;

  // זיהוי חזרה — כשמקלידים שם, חיפוש בפונים קיימים
  useEffect(() => {
    if (!isQuickClientMode || quickClientName.trim().length < 2) {
      setMatchedClient(null);
      return;
    }
    const searchName = quickClientName.trim().toLowerCase();
    const found = clients.find(
      (c) => c.isQuickClient && c.name.toLowerCase().includes(searchName)
    );
    setMatchedClient(found || null);
  }, [quickClientName, isQuickClientMode, clients]);

  const handleDurationChange = (minutes: number) => {
    setCustomDuration(minutes);
    if (formData.startTime) {
      const start = new Date(formData.startTime);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + minutes);
      setFormData((prev) => ({
        ...prev,
        endTime: format(end, "yyyy-MM-dd'T'HH:mm")
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ולידציה — פגישת ייעוץ
    if (isQuickClientMode) {
      if (!quickClientName.trim()) {
        toast.error("נא להזין שם");
        return;
      }
      if (!quickClientPhone.trim() && !quickClientEmail.trim()) {
        toast.error("נדרש טלפון או מייל");
        return;
      }
      if (!formData.topic.trim()) {
        toast.error("נא להזין נושא הפגישה");
        return;
      }
      if (!formData.startTime || !formData.endTime) {
        toast.error("נא למלא את שעות הפגישה");
        return;
      }
      // Phase 3: למזכירה חובה לבחור מטפל/ת אחראי/ת לפני יצירת מטופל מהיר —
      // אחרת ה-resolver בשרת היה בוחר את המזכירה עצמה. ל-OWNER ה-picker
      // אופציונלי (אם לא יבחר, ה-resolver ייקח את OWNER עצמו, וזה הגיוני).
      // הוולידציה חלה רק כשיוצרים פונה חדש (לא כשבחרו מ-matchedClient קיים).
      if (
        !formData.clientId &&
        myPermissions.clinicRole === "SECRETARY" &&
        !pickedTherapistId
      ) {
        toast.error("יש לבחור מטפל/ת אחראי/ת");
        return;
      }
    } else if (formData.type !== "BREAK" && (!formData.clientId || !formData.startTime || !formData.endTime)) {
      toast.error("נא למלא את כל השדות");
      return;
    } else if (formData.type === "BREAK" && (!formData.startTime || !formData.endTime)) {
      toast.error("נא למלא את שעות ההפסקה");
      return;
    }

    setIsSubmitting(true);

    try {
      // ── פגישת ייעוץ: יצירת פונה מהיר ← פגישה ──
      let clientIdToUse = formData.clientId;

      if (isQuickClientMode && !formData.clientId) {
        // יצירת פונה חדש — רק אם לא נבחר פונה קיים.
        // Phase 3: כשבעלים/מזכירה בוחרים מטפל אחראי — מצרפים therapistId.
        // ל-THERAPIST/עצמאי לא נשלח, וה-resolver בשרת ייקח self (התנהגות תאימות).
        const clientRes = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isQuickClient: true,
            name: quickClientName.trim(),
            phone: quickClientPhone.trim() || undefined,
            email: quickClientEmail.trim() || undefined,
            defaultSessionPrice: parseFloat(formData.price) || undefined,
            ...(canPickTherapist && pickedTherapistId
              ? { therapistId: pickedTherapistId }
              : {}),
          }),
        });

        if (!clientRes.ok) {
          const errData = await clientRes.json().catch(() => null);
          throw new Error(errData?.message || "שגיאה ביצירת הפונה");
        }

        const newClient = await clientRes.json();
        clientIdToUse = newClient.id;
      } else if (isQuickClientMode && formData.clientId) {
        // עדכון טלפון/מייל של פונה קיים (אם השתנו)
        await fetch(`/api/clients/${formData.clientId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: quickClientPhone.trim() || undefined,
            email: quickClientEmail.trim() || undefined,
          }),
        });
      }
      // ── Recurring: show preview before creating ──
      if (formData.isRecurring && formData.weeksToRepeat > 1) {
        const startDate = new Date(formData.startTime);
        const endDate = new Date(formData.endTime);
        const client = clients.find((c) => c.id === clientIdToUse);
        const planned: Array<{ startLocal: string; endLocal: string; start: Date; end: Date }> = [];

        for (let i = 0; i < formData.weeksToRepeat; i++) {
          const s = addWeeks(startDate, i);
          const e = addWeeks(endDate, i);
          planned.push({
            start: s,
            end: e,
            startLocal: format(s, "yyyy-MM-dd'T'HH:mm"),
            endLocal: format(e, "yyyy-MM-dd'T'HH:mm"),
          });
        }

        const rangeStart = format(planned[0].start, "yyyy-MM-dd'T'HH:mm");
        const rangeEnd = format(planned[planned.length - 1].end, "yyyy-MM-dd'T'HH:mm");
        let rangeSessions = sessions;
        try {
          const qs = new URLSearchParams({
            startDate: rangeStart,
            endDate: rangeEnd,
          });
          const rangeRes = await fetch(`/api/sessions?${qs.toString()}`);
          if (rangeRes.ok) {
            rangeSessions = await rangeRes.json();
          }
        } catch {
          // fallback to local sessions on network error
        }

        const previewItems: RecurringPreviewItem[] = planned.map((p, idx) => {
          const dateStr = format(p.start, "yyyy-MM-dd");
          const timeStr = format(p.start, "HH:mm");
          const key = `form_${dateStr}_${timeStr}_${idx}`;
          const overlap = rangeSessions.find((s: CalendarSession) => {
            if (s.status === "CANCELLED") return false;
            // יומן רב-מטפלים: פגישת מטפל/ת אחר/ת אינה התנגשות — אלא אם היא
            // באותו חדר (שלב 2). מטפל/ת פנוי/ה בחדר אחר = אין התנגשות.
            if (
              isMultiTherapistClinic &&
              targetTherapistId &&
              s.therapistId &&
              s.therapistId !== targetTherapistId
            ) {
              const sameRoom = !!(targetRoomId && s.roomId && s.roomId === targetRoomId);
              if (!sameRoom) return false;
            }
            const sStart = new Date(s.startTime);
            const sEnd = new Date(s.endTime);
            return p.start < sEnd && p.end > sStart;
          });
          return {
            key,
            date: dateStr,
            time: timeStr,
            clientName: client?.name || (isQuickClientMode ? quickClientName.trim() : (formData.type === "BREAK" ? "הפסקה" : "ללא שם")),
            clientId: clientIdToUse,
            patternId: "",
            status: (overlap ? "conflict" : "ok") as "ok" | "conflict",
            conflictWith: overlap
              ? {
                  id: overlap.id,
                  clientName: overlap.client?.name || (overlap.type === "BREAK" ? "הפסקה" : "ללא שם"),
                  startTime: overlap.startTime,
                  endTime: overlap.endTime,
                  // שלב 2 (חדרים): סיבת ההתנגשות — שם החדר, רק כשהיא על החדר שנבחר.
                  roomName:
                    targetRoomId && overlap.roomId === targetRoomId
                      ? pickedRoom?.name ?? null
                      : null,
                }
              : undefined,
          };
        });

        const defaults: Record<string, "skip" | "replace" | "create"> = {};
        previewItems.forEach((item) => {
          if (item.status === "conflict") defaults[item.key] = "skip";
        });

        onShowRecurringPreview(
          previewItems,
          defaults,
          {
            clientId: clientIdToUse,
            type: formData.type,
            price: formData.price,
            topic: formData.topic.trim(),
            // שלב 2 (חדרים): שם החדר הנבחר כ-location (לתאימות), אחרת טקסט חופשי.
            location: pickedRoom ? pickedRoom.name : formData.location.trim() || undefined,
            // יומן רב-מטפלים: המטפל/ת היעד לסדרה כולה (אם נבחר/ה). לא להפסקה.
            therapistId:
              formData.type !== "BREAK" && canPickTherapist && pickedTherapistId
                ? pickedTherapistId
                : undefined,
            // שלב 2 (חדרים): החדר היעד לסדרה כולה (לא בהפסקה).
            roomId:
              formData.type !== "BREAK" && pickedRoomId ? pickedRoomId : undefined,
            sessions: planned.map((p) => ({ startTime: p.startLocal, endTime: p.endLocal })),
          }
        );
        onOpenChange(false);
        setIsSubmitting(false);
        return;
      }

      // ── Single session: check for conflicts locally first ──
      const newStart = new Date(formData.startTime);
      const newEnd = new Date(formData.endTime);
      // הגנת עומק: הוולידציה כבר חסמה שדות ריקים, אבל אם בכל זאת התקבל Invalid Date —
      // לא נבצע find על NaN (שיחזיר תמיד false ויאפשר submit שיכול להיכשל בשרת)
      if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
        toast.error("שעות לא תקינות");
        setIsSubmitting(false);
        return;
      }
      // איתור כל הפגישות החופפות — לא רק הראשונה. אחרת בחירת "החלף"
      // מבטלת רק אחת ומשאירה את האחרות, וזה יוצר חפיפה חדשה.
      const conflicts = sessions.filter((s) => {
        if (s.status === "CANCELLED" || s.status === "COMPLETED" || s.status === "NO_SHOW") return false;
        // יומן רב-מטפלים: פגישה של מטפל/ת *אחר/ת* אינה התנגשות — מטפל/ת פנוי/ה
        // יכול/ה לקבל מטופל באותה שעה. מסננים אותה החוצה רק כשידוע מי המטפל היעד
        // וזו קליניקה רב-מטפלית. למטפל יחיד / עצמאי, targetTherapistId הוא הוא עצמו
        // וכל הפגישות שלו ממילא נכללות — אז ההתנהגות זהה לקודם (אין רגרסיה).
        // שלב 2 (חדרים): חריג — פגישת מטפל/ת אחר/ת *באותו חדר* כן התנגשות
        // (אי אפשר לאכלס חדר אחד בשתי פגישות במקביל).
        if (
          isMultiTherapistClinic &&
          targetTherapistId &&
          s.therapistId &&
          s.therapistId !== targetTherapistId
        ) {
          const sameRoom = !!(targetRoomId && s.roomId && s.roomId === targetRoomId);
          if (!sameRoom) return false;
        }
        const sStart = new Date(s.startTime);
        const sEnd = new Date(s.endTime);
        return newStart < sEnd && newEnd > sStart;
      });

      const payload = {
        clientId: clientIdToUse,
        startTime: formData.startTime,
        endTime: formData.endTime,
        type: formData.type,
        price: parseFloat(formData.price) || 0,
        topic: formData.topic.trim() || undefined,
        // location: שם החדר הנבחר אם יש (שלב 2), אחרת טקסט חופשי. נשלח גם
        // כשיש roomId, לתאימות עם תצוגות/סנכרון יומן שמסתמכים על location.
        location: pickedRoom ? pickedRoom.name : formData.location.trim() || undefined,
        // יומן רב-מטפלים: שולחים את המטפל/ת שנבחר/ה. ריק → undefined → השרת פותר
        // לפי המטפל/ת הקבוע/ה של המטופל (התנהגות קיימת למטפל יחיד / ללא בורר).
        // בהפסקה לא שולחים מטפל יעד — הפסקה תמיד שייכת למבצע (לא ל"מטפל הנבחר").
        therapistId:
          formData.type !== "BREAK" && canPickTherapist && pickedTherapistId
            ? pickedTherapistId
            : undefined,
        // שלב 2 (חדרים): מזהה החדר הנבחר. לא בהפסקה. ריק → undefined → ללא חדר.
        roomId:
          formData.type !== "BREAK" && pickedRoomId ? pickedRoomId : undefined,
      };

      if (conflicts.length > 0) {
        // נמצאה התנגשות (אחת או יותר) — מציגים דיאלוג אישור עם 3 אפשרויות
        setConflictPrompt({
          conflicts: conflicts.map((c) => ({
            id: c.id,
            clientName: c.client?.name || (c.type === "BREAK" ? "הפסקה" : "ללא שם"),
            startTime: typeof c.startTime === "string" ? c.startTime : new Date(c.startTime).toISOString(),
            endTime: typeof c.endTime === "string" ? c.endTime : new Date(c.endTime).toISOString(),
            // יומן רב-מטפלים: שם המטפל/ת של הפגישה החופפת — להבחין בין התנגשות
            // אצל אותו מטפל (חמורה) לבין משבצת משותפת.
            therapistName: c.therapistName ?? null,
            // שלב 2 (חדרים): אם ההתנגשות היא על החדר שנבחר — שם החדר (כדי
            // להבהיר "החדר תפוס" כשהמטפל/ת שונה/ים).
            roomName:
              targetRoomId && c.roomId === targetRoomId ? pickedRoom?.name ?? null : null,
          })),
          pendingPayload: payload,
        });
        setConflictDecision("replace");
        setIsSubmitting(false);
        return;
      }

      await submitSingleSession(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הפגישה");
      setIsSubmitting(false);
    }
  };

  const submitSingleSession = async (
    payload: {
      clientId: string;
      startTime: string;
      endTime: string;
      type: string;
      price: number;
      topic: string | undefined;
      location: string | undefined;
      therapistId: string | undefined;
      roomId: string | undefined;
    },
    options?: { allowOverlap?: boolean; replaceSessionIds?: string[] }
  ) => {
    try {
      // יוצרים את הפגישה החדשה קודם (עם allowOverlap כדי לעקוף את בדיקת ההתנגשות בשרת
      // במצב "החלף" ובמצב "צור בכל זאת"). אם POST ייכשל — לא נבטל את הקיימות ולא נאבד מידע.
      const willOverlap = options?.allowOverlap || (options?.replaceSessionIds?.length ?? 0) > 0;
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          isRecurring: false,
          allowOverlap: willOverlap || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "שגיאה ביצירת הפגישה");
      }

      // POST הצליח. אם המשתמש בחר "החלף" — מבטלים את כל הפגישות הקיימות החופפות.
      // אם ביטול של חלקן נכשל — לא משחזרים, רק מתריעים: הפגישה החדשה כבר נוצרה.
      const idsToCancel = options?.replaceSessionIds ?? [];
      if (idsToCancel.length > 0) {
        const cancelResults = await Promise.all(
          idsToCancel.map((id) =>
            fetch(`/api/sessions/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "CANCELLED" }),
            }).then((r) => r.ok).catch(() => false)
          )
        );
        const failedCount = cancelResults.filter((ok) => !ok).length;
        if (failedCount > 0) {
          toast.warning(
            failedCount === idsToCancel.length
              ? "הפגישה החדשה נוצרה, אך ביטול הפגישות הקיימות נכשל. בטל/י אותן ידנית."
              : `הפגישה החדשה נוצרה, אך ${failedCount} מתוך ${idsToCancel.length} פגישות לא בוטלו. בדוק/י ידנית.`
          );
        } else {
          toast.success(
            idsToCancel.length === 1
              ? "הפגישה הקיימת בוטלה והפגישה החדשה נוצרה"
              : `${idsToCancel.length} פגישות קיימות בוטלו והפגישה החדשה נוצרה`
          );
        }
      } else {
        toast.success("הפגישה נוצרה בהצלחה");
      }

      setConflictPrompt(null);
      onOpenChange(false);
      onSessionCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הפגישה");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>פגישה חדשה</DialogTitle>
          <DialogDescription>
            {selectedDate && format(selectedDate, "EEEE, d בMMMM yyyy")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formData.type !== "BREAK" && !isQuickClientMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="clientId">מטופל קבוע</Label>
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickClientMode(true);
                    setFormData((prev) => ({ ...prev, clientId: "" }));
                  }}
                  className="text-xs gap-1.5 inline-flex items-center text-blue-600 hover:text-blue-700 font-medium"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  פגישת ייעוץ
                </button>
              </div>
              {/* שדה חיפוש + רשימה נפתחת. הרשימה מוצגת רק כשהשדה בפוקוס/בהקלדה,
                  כדי שלא תופיע כל רשימת המטופלים מיד עם פתיחת הדיאלוג. כשיש בחירה
                  והרשימה סגורה — מוצג שם המטופל הנבחר במקומה (עם אפשרות שינוי).
                  הוחלף ה-Select (Radix) שבו החיפוש "הסתתר" עד פתיחה ידנית. */}
              <div className="relative">
                <Search aria-hidden="true" className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  aria-label="חיפוש מטופל"
                  placeholder="חיפוש מטופל..."
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setClientListOpen(true);
                  }}
                  onFocus={() => setClientListOpen(true)}
                  // השהיה קצרה לפני סגירה כדי שבחירת פריט (mousedown) תספיק להירשם
                  // לפני שהרשימה יורדת מה-DOM בלחיצה מחוץ לשדה.
                  onBlur={() => setTimeout(() => setClientListOpen(false), 150)}
                  className="h-9 pr-8"
                />
              </div>
              {clientListOpen ? (
                <div className="border border-border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {sortedFilteredClients.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {clientSearch.trim() ? "לא נמצאו מטופלים" : "אין מטופלים"}
                    </div>
                  ) : (
                    sortedFilteredClients.map((client) => {
                      const isSelected = client.id === formData.clientId;
                      return (
                        <button
                          type="button"
                          key={client.id}
                          // onMouseDown (לא onClick): רץ לפני ה-blur של שדה החיפוש,
                          // כך שהבחירה נרשמת בוודאות גם כשה-blur סוגר את הרשימה.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const clientPrice = client.defaultSessionPrice;
                            // מחיר: עדיפות למחיר אישי; אם אין — ברירת המחדל של המטפל;
                            // אחרת — שומרים על מה שכבר היה בטופס.
                            setFormData((prev) => ({
                              ...prev,
                              clientId: client.id,
                              price: clientPrice
                                ? String(clientPrice)
                                : defaultSessionPrice != null
                                  ? String(defaultSessionPrice)
                                  : prev.price,
                            }));
                            setClientSearch("");
                            setClientListOpen(false);
                            // בורר מטפל (יומן רב-מטפלים): ברירת מחדל למטפל הקבוע של
                            // המטופל שנבחר. ניתן לשינוי ידני אחר כך (ממלא מקום / מטפל פנוי).
                            if (canPickTherapist && client.therapistId) {
                              setPickedTherapistId(client.therapistId);
                            }
                          }}
                          className={`w-full text-right px-3 py-2.5 text-sm transition-colors border-b border-border last:border-0 flex items-center justify-between gap-2 ${
                            isSelected ? "bg-primary/10 font-medium" : "hover:bg-muted"
                          }`}
                        >
                          <span className="truncate">{formatNameLastFirst(client.name)}</span>
                          {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : pickedClient ? (
                <button
                  type="button"
                  onClick={() => setClientListOpen(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-sm text-right transition-colors hover:bg-primary/10"
                >
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium truncate">{formatNameLastFirst(pickedClient.name)}</span>
                  <span className="text-xs text-muted-foreground mr-auto shrink-0">שינוי</span>
                </button>
              ) : null}
            </div>
          )}

          {/* יומן רב-מטפלים: בורר מטפל/ת לפגישה (טופס רגיל). מאפשר לבעלים/מזכירה
              לקבוע פגישה אצל מטפל/ת פנוי/ה — גם על משבצת תפוסה אצל מטפל אחר, וגם
              למטופל ששייך בקביעות למטפל אחר (ממלא מקום). מוצג רק בקליניקה עם יותר
              ממטפל אחד; למטפל יחיד / עצמאי לא קיים כלל, אז היומן הרגיל לא משתנה. */}
          {formData.type !== "BREAK" && !isQuickClientMode && canPickTherapist && isMultiTherapistClinic && (
            <div className="space-y-1.5">
              <Label htmlFor="sessionTherapistId" className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                מטפל/ת לפגישה
              </Label>
              <Select
                value={pickedTherapistId}
                onValueChange={(value) => setPickedTherapistId(value)}
                disabled={isSubmitting || loadingTherapists}
              >
                <SelectTrigger id="sessionTherapistId" className="h-9">
                  <SelectValue placeholder={loadingTherapists ? "טוען..." : "בחר/י מטפל/ת..."} />
                </SelectTrigger>
                <SelectContent>
                  {clinicTherapists.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name || t.email}
                      {t.clinicRole === "OWNER" ? " (בעלים)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* חיווי "ממלא מקום" — כשנבחר מטפל/ת שונה מהמטפל/ת הקבוע/ה של המטופל. */}
              {pickedClient?.therapistId &&
                pickedTherapistId &&
                pickedTherapistId !== pickedClient.therapistId && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    שים/י לב: המטופל/ת משויך/ת בקביעות{" "}
                    {clientPrimaryTherapistName ? `ל־${clientPrimaryTherapistName}` : "למטפל/ת אחר/ת"}.
                    הפגישה הזו תיווצר אצל המטפל/ת שנבחר/ה כאן בלבד — השיוך הקבוע לא ישתנה.
                  </p>
                )}
            </div>
          )}

          {/* טופס פגישת ייעוץ — פונה חדש */}
          {formData.type !== "BREAK" && isQuickClientMode && (
            <div className="space-y-3 p-3 border rounded-lg border-blue-200 bg-blue-50/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-700">
                  {formData.clientId ? "פגישת ייעוץ — פונה קיים" : "פגישת ייעוץ — פונה חדש"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsQuickClientMode(false);
                    setQuickClientName("");
                    setQuickClientPhone("");
                    setQuickClientEmail("");
                    setMatchedClient(null);
                    setPickedTherapistId("");
                    setFormData((prev) => ({ ...prev, clientId: "", topic: "" }));
                  }}
                  className="text-xs text-muted-foreground h-7 px-2"
                >
                  <ArrowRight className="h-3 w-3 ml-1" />
                  חזרה לבחירת מטופל
                </Button>
              </div>

              {/* Phase 3: picker מטפל אחראי לפונה החדש — רק ל-OWNER/SECRETARY
                  בקליניקה, ורק כשיוצרים פונה חדש (לא כשמתעדכן קיים).
                  למזכירה זה חובה (חוסם submit); ל-OWNER אופציונלי. */}
              {canPickTherapist && !formData.clientId && (
                <div className="space-y-1.5">
                  <Label htmlFor="pickedTherapistId" className="text-xs flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-blue-700" />
                    מטפל/ת אחראי/ת
                    {myPermissions.clinicRole === "SECRETARY" && (
                      <span className="text-red-500">*</span>
                    )}
                  </Label>
                  <Select
                    value={pickedTherapistId}
                    onValueChange={(value) => setPickedTherapistId(value)}
                    disabled={isSubmitting || loadingTherapists}
                  >
                    <SelectTrigger id="pickedTherapistId" className="h-9 bg-white">
                      <SelectValue
                        placeholder={loadingTherapists ? "טוען..." : "בחר/י מטפל/ת..."}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {clinicTherapists.length === 0 && !loadingTherapists ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          לא נמצאו מטפלים פעילים בקליניקה
                        </div>
                      ) : (
                        clinicTherapists.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name || t.email}
                            {t.clinicRole === "OWNER" ? " (בעלים)" : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="quickName">שם <span className="text-red-500">*</span></Label>
                <Input
                  id="quickName"
                  placeholder="שם מלא"
                  value={quickClientName}
                  onChange={(e) => setQuickClientName(e.target.value)}
                  disabled={!!formData.clientId}
                />
              </div>

              {/* זיהוי חזרה */}
              {matchedClient && !formData.clientId && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                  <p className="text-amber-800">
                    {matchedClient.name} כבר קיים/ת במערכת.{" "}
                    <button
                      type="button"
                      className="underline font-medium text-amber-900"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          clientId: matchedClient.id,
                          price: matchedClient.defaultSessionPrice
                            ? String(matchedClient.defaultSessionPrice)
                            : prev.price,
                        }));
                        // נשארים במצב ייעוץ — ממלאים את פרטי הפונה
                        setQuickClientName(matchedClient.name);
                        setQuickClientPhone(matchedClient.phone || "");
                        setQuickClientEmail(matchedClient.email || "");
                      }}
                    >
                      לחץ כאן לבחירה
                    </button>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="quickPhone" className="text-xs">טלפון</Label>
                  <Input
                    id="quickPhone"
                    type="tel"
                    placeholder="054-1234567"
                    value={quickClientPhone}
                    onChange={(e) => setQuickClientPhone(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="quickEmail" className="text-xs">מייל</Label>
                  <Input
                    id="quickEmail"
                    type="email"
                    placeholder="example@mail.com"
                    value={quickClientEmail}
                    onChange={(e) => setQuickClientEmail(e.target.value)}
                    dir="ltr"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">* נדרש טלפון או מייל</p>
            </div>
          )}

          {/* נושא הפגישה — רק בפגישת ייעוץ */}
          {formData.type !== "BREAK" && isQuickClientMode && (
            <div className="space-y-2">
              <Label htmlFor="topic">
                נושא הפגישה <span className="text-red-500">*</span>
              </Label>
              <Input
                id="topic"
                placeholder="למשל: ייעוץ ראשוני, מעקב חרדה, ליווי הורי..."
                value={formData.topic}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, topic: e.target.value }))
                }
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">שעת התחלה</Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => {
                  const startValue = e.target.value;
                  if (startValue) {
                    const start = new Date(startValue);
                    const end = new Date(start);
                    end.setMinutes(end.getMinutes() + defaultSessionDuration);
                    setFormData((prev) => ({
                      ...prev,
                      startTime: startValue,
                      endTime: format(end, "yyyy-MM-dd'T'HH:mm")
                    }));
                  } else {
                    setFormData((prev) => ({ ...prev, startTime: startValue }));
                  }
                }}
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime">שעת סיום</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, endTime: e.target.value }))
                }
                dir="ltr"
              />
            </div>
          </div>

          {/* Duration Customizer */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDurationCustomizer(!showDurationCustomizer)}
              className="w-full text-sm text-muted-foreground hover:text-primary"
            >
              <Settings className="h-4 w-4 ml-2" />
              התאם משך פגישה
            </Button>

            {showDurationCustomizer && (
              <div className="border rounded-lg p-3 bg-slate-50 space-y-3 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="customDuration" className="text-sm whitespace-nowrap">
                    משך (דקות):
                  </Label>
                  <Input
                    id="customDuration"
                    type="number"
                    min="5"
                    max="180"
                    value={customDuration}
                    onChange={(e) => handleDurationChange(parseInt(e.target.value) || defaultSessionDuration)}
                    className="w-20 bg-white"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[15, 30, 45, 60].map((minutes) => (
                    <Button
                      key={minutes}
                      type="button"
                      variant={customDuration === minutes ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleDurationChange(minutes)}
                      className="text-xs h-10 sm:h-8 min-w-[60px]"
                    >
                      {minutes} דק׳
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">סוג פגישה</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BREAK">
                    <div className="flex items-center gap-2">
                      <Waves className="h-4 w-4" />
                      הפסקה
                    </div>
                  </SelectItem>
                  <SelectItem value="IN_PERSON">פרונטלי</SelectItem>
                  <SelectItem value="ONLINE">אונליין</SelectItem>
                  <SelectItem value="PHONE">טלפון</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">מחיר (₪)</Label>
              <Input
                id="price"
                type="number"
                placeholder="0"
                value={formData.price}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, price: e.target.value }))
                }
                dir="ltr"
              />
            </div>
          </div>

          {/* מיקום / חדר. שלב 2: בקליניקה עם חדרים מוגדרים — בורר חדר (roomId
              מדויק + בדיקת חפיפת חדר). "ללא חדר" חושף שדה טקסט חופשי (אונליין/
              כתובת). מטפל/ת עצמאי/ת (אין חדרים) → שדה טקסט כמו קודם, ללא שינוי. */}
          {formData.type !== "BREAK" && (
            <div className="space-y-2">
              {activeRooms.length > 0 ? (
                <>
                  <Label htmlFor="roomId">חדר</Label>
                  <Select
                    value={pickedRoomId || "__none__"}
                    onValueChange={(v) => setPickedRoomId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger id="roomId">
                      <SelectValue placeholder="בחר/י חדר..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">ללא חדר</SelectItem>
                      {activeRooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* כשלא נבחר חדר — שדה מיקום חופשי (אונליין / כתובת) */}
                  {!pickedRoomId && (
                    <Input
                      id="location"
                      placeholder="או מיקום אחר (אונליין, כתובת)"
                      value={formData.location}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, location: e.target.value }))
                      }
                      maxLength={500}
                    />
                  )}
                </>
              ) : (
                <>
                  <Label htmlFor="location">מיקום / חדר (אופציונלי)</Label>
                  <Input
                    id="location"
                    placeholder="למשל: חדר 1, אונליין, כתובת מלאה"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, location: e.target.value }))
                    }
                    maxLength={500}
                  />
                </>
              )}
            </div>
          )}

          {/* Recurring Options */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Repeat className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">פגישה חוזרת</p>
                <p className="text-sm text-muted-foreground">
                  שכפל את הפגישה לשבועות הבאים
                </p>
              </div>
            </div>
            <Switch
              checked={formData.isRecurring}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isRecurring: checked }))
              }
            />
          </div>

          {formData.isRecurring && (
            <div className="space-y-2">
              <Label>כמה שבועות?</Label>
              <Select
                value={formData.weeksToRepeat.toString()}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, weeksToRepeat: parseInt(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 4, 8, 12, 16].map((weeks) => (
                    <SelectItem key={weeks} value={weeks.toString()}>
                      {weeks} שבועות
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  יוצר...
                </>
              ) : (
                "צור פגישה"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

      {/* דיאלוג התנגשות — פגישה בודדת */}
      <Dialog
        open={!!conflictPrompt}
        onOpenChange={(o) => {
          if (!o && !isSubmitting) {
            setConflictPrompt(null);
            setConflictDecision("replace");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              התנגשות עם פגישה קיימת
            </DialogTitle>
            <DialogDescription>
              באותו זמן כבר קיימת פגישה במערכת. בחר/י מה לעשות.
            </DialogDescription>
          </DialogHeader>

          {conflictPrompt && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-amber-800">
                  {conflictPrompt.conflicts.length === 1
                    ? "פגישה חופפת:"
                    : `${conflictPrompt.conflicts.length} פגישות חופפות:`}
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {conflictPrompt.conflicts.map((c) => (
                    <div
                      key={c.id}
                      className="text-xs text-amber-700 bg-amber-100 rounded px-3 py-2"
                    >
                      <strong>{c.clientName}</strong>
                      {" • "}
                      {new Date(c.startTime).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" })}
                      {" • "}
                      {new Date(c.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}
                      {" - "}
                      {new Date(c.endTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" })}
                      {/* יומן רב-מטפלים: מי המטפל/ת של הפגישה החופפת. */}
                      {isMultiTherapistClinic && c.therapistName && (
                        <span className="block mt-0.5 opacity-80">מטפל/ת: {c.therapistName}</span>
                      )}
                      {/* שלב 2 (חדרים): אם ההתנגשות היא על אותו חדר — מבהירים. */}
                      {c.roomName && (
                        <span className="block mt-0.5 font-medium text-amber-900">
                          ⚠ החדר &quot;{c.roomName}&quot; תפוס בשעה זו
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded hover:bg-muted/50">
                  <input
                    type="radio"
                    name="single-conflict-decision"
                    className="mt-1"
                    checked={conflictDecision === "replace"}
                    onChange={() => setConflictDecision("replace")}
                    disabled={isSubmitting}
                  />
                  <div>
                    <p className="font-medium">
                      {conflictPrompt.conflicts.length === 1
                        ? "בטל את הפגישה הקיימת וצור חדשה"
                        : `בטל את כל ${conflictPrompt.conflicts.length} הפגישות החופפות וצור חדשה`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {conflictPrompt.conflicts.length === 1
                        ? "הפגישה הקיימת תסומן כמבוטלת"
                        : "כל הפגישות החופפות יסומנו כמבוטלות"}
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded hover:bg-muted/50">
                  <input
                    type="radio"
                    name="single-conflict-decision"
                    className="mt-1"
                    checked={conflictDecision === "create"}
                    onChange={() => setConflictDecision("create")}
                    disabled={isSubmitting}
                  />
                  <div>
                    <p className="font-medium">צור בכל זאת (חפיפה)</p>
                    <p className="text-xs text-muted-foreground">
                      {conflictPrompt.conflicts.length === 1
                        ? "שתי הפגישות יישארו ביומן באותו זמן"
                        : "כל הפגישות יישארו ביומן באותו זמן"}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConflictPrompt(null);
                setConflictDecision("replace");
              }}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            <Button
              type="button"
              disabled={isSubmitting || !conflictPrompt}
              onClick={() => {
                if (!conflictPrompt) return;
                setIsSubmitting(true);
                if (conflictDecision === "replace") {
                  submitSingleSession(conflictPrompt.pendingPayload, {
                    replaceSessionIds: conflictPrompt.conflicts.map((c) => c.id),
                  });
                } else {
                  submitSingleSession(conflictPrompt.pendingPayload, { allowOverlap: true });
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מבצע...
                </>
              ) : (
                "המשך"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
