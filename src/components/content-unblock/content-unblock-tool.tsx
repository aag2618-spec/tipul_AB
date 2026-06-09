"use client";

// כלי "שחרור תיק חסום" (נטפרי/אתרוג).
//
// עיקרון קריטי: הרכיב מציג אך ורק מטה-דאטה (שם מטופל, תאריך, סוג, תוויות
// "יש סיכום"/"יש ניתוח") — לעולם לא את תוכן הסיכום/הניתוח. כך הדף עצמו לא
// ייחסם ע"י סינון התוכן, וניתן להגיע אליו גם כשתיק המטופל חסום.
//
// זרימה: בחירת מטופל → מצאי פריטים (ממוין מהחדש לישן) → אישור → מחיקה לצמיתות.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Unlock,
  Loader2,
  Trash2,
  AlertTriangle,
  Search,
  FileText,
  Brain,
  ClipboardList,
  Mic,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type ClientRow = {
  id: string;
  name: string;
  status: string;
  hasComprehensive: boolean;
  sessionsCount: number;
  questionnairesCount: number;
};

type SessionItem = {
  id: string;
  startTime: string;
  type: string;
  status: string;
  skipSummary: boolean;
  hasNote: boolean;
  hasAnalysis: boolean;
};

type Inventory = {
  client: { id: string; name: string };
  sessions: SessionItem[];
  comprehensive: { has: boolean; at: string | null };
  questionnaireAnalyses: {
    id: string;
    analysisType: string;
    createdAt: string;
    templateName: string | null;
  }[];
  questionnaireResponseAi: {
    id: string;
    createdAt: string;
    completedAt: string | null;
    templateName: string | null;
  }[];
  recordingAnalyses: { id: string; createdAt: string }[];
  sessionPreps: { id: string; sessionDate: string; createdAt: string }[];
  aiInsights: { count: number };
  clinicalProfile: { has: boolean };
};

type DeleteType =
  | "session"
  | "comprehensive"
  | "questionnaireAnalysis"
  | "questionnaireResponseAi"
  | "recordingAnalysis"
  | "aiInsights"
  | "sessionPrep"
  | "clinicalProfile";

type Pending = {
  type: DeleteType;
  clientId: string;
  itemId?: string;
  label: string;
  warn?: boolean;
};

const SESSION_TYPE_HE: Record<string, string> = {
  IN_PERSON: "פגישה",
  ONLINE: "אונליין",
  PHONE: "טלפון",
  BREAK: "הפסקה",
};

function fmtDate(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("he-IL");
}
function fmtDateTime(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContentUnblockTool() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [invLoading, setInvLoading] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [deleting, setDeleting] = useState(false);
  // מונה בקשות — מונע race כשמחליפים מטופל במהירות (תשובה ישנה לא תדרוס חדשה).
  const reqRef = useRef(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/content-unblock/clients");
        if (!res.ok) {
          if (active) toast.error("שגיאה בטעינת רשימת המטופלים");
          return;
        }
        const data = await res.json();
        if (active) setClients(data.clients || []);
      } catch {
        if (active) toast.error("שגיאת רשת");
      } finally {
        if (active) setClientsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadInventory = useCallback(async (clientId: string) => {
    const reqId = ++reqRef.current;
    setInvLoading(true);
    setInventory(null);
    try {
      const res = await fetch(`/api/content-unblock/clients/${clientId}/inventory`);
      if (reqId !== reqRef.current) return; // החלפת מטופל בינתיים — מתעלמים
      if (!res.ok) {
        toast.error("שגיאה בטעינת המצאי");
        return;
      }
      const data = (await res.json()) as Inventory;
      if (reqId !== reqRef.current) return;
      setInventory(data);
    } catch {
      if (reqId === reqRef.current) toast.error("שגיאת רשת");
    } finally {
      if (reqId === reqRef.current) setInvLoading(false);
    }
  }, []);

  function selectClient(id: string) {
    setSelectedId(id);
    void loadInventory(id);
  }

  async function doDelete() {
    if (!pending) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/content-unblock/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: pending.type,
          clientId: pending.clientId,
          itemId: pending.itemId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || "המחיקה נכשלה");
        return;
      }
      toast.success("הפריט נמחק. אם התיק עדיין חסום, מחק/י פריטים נוספים ונסה/י שוב.");
      setPending(null);
      if (selectedId) void loadInventory(selectedId);
    } catch {
      toast.error("שגיאת רשת");
    } finally {
      setDeleting(false);
    }
  }

  const filteredClients = clients.filter((c) =>
    c.name?.toLowerCase().includes(search.trim().toLowerCase())
  );

  const inv = inventory;
  const isEmpty =
    inv &&
    inv.sessions.length === 0 &&
    !inv.comprehensive.has &&
    inv.questionnaireAnalyses.length === 0 &&
    inv.questionnaireResponseAi.length === 0 &&
    inv.recordingAnalyses.length === 0 &&
    inv.sessionPreps.length === 0 &&
    inv.aiInsights.count === 0 &&
    !inv.clinicalProfile.has;

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Unlock className="h-6 w-6" />
          שחרור תיק חסום
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          אם תיק מטופל לא נפתח בגלל סינון תוכן (נטפרי/אתרוג), כאן אפשר למחוק
          סיכום, ניתוח AI או תוכן אחר של פגישה ספציפית — מבלי להיכנס לתיק.
          הדף מציג רק תאריכים ותוויות, אף פעם לא את התוכן עצמו.
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            המחיקה היא <strong>לצמיתות ואינה הפיכה</strong>. בדרך כלל הסיכום
            שחוסם הוא האחרון שנכתב — מומלץ למחוק מהחדש לישן ולבדוק אם התיק נפתח.
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        {/* בחירת מטופל */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">בחירת מטופל</CardTitle>
            <CardDescription>חיפוש לפי שם</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="שם מטופל..."
                className="pr-8"
              />
            </div>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {clientsLoading ? (
                <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  טוען...
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">
                  לא נמצאו מטופלים
                </div>
              ) : (
                filteredClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectClient(c.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-right text-sm transition-colors hover:bg-muted ${
                      selectedId === c.id ? "bg-muted font-medium" : ""
                    }`}
                  >
                    <span className="truncate">{c.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* מצאי תוכן */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {inv ? `תוכן של ${inv.client.name}` : "תוכן למחיקה"}
            </CardTitle>
            <CardDescription>
              {selectedId
                ? "לחיצה על מחיקה תסיר את הפריט לצמיתות."
                : "בחר/י מטופל מהרשימה."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {invLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוען מצאי...
              </div>
            )}

            {!invLoading && !selectedId && (
              <p className="text-sm text-muted-foreground">
                בחר/י מטופל מהרשימה כדי לראות את הפריטים שניתן למחוק.
              </p>
            )}

            {!invLoading && isEmpty && (
              <p className="text-sm text-muted-foreground">
                אין תוכן קליני למחיקה למטופל זה.
              </p>
            )}

            {!invLoading && inv && !isEmpty && (
              <>
                {/* פגישות: סיכום + ניתוח AI */}
                {inv.sessions.length > 0 && (
                  <Section
                    icon={<FileText className="h-4 w-4" />}
                    title="סיכומי פגישות וניתוחי AI"
                  >
                    {inv.sessions.map((s) => {
                      const parts: string[] = [];
                      if (s.hasNote) parts.push("סיכום");
                      if (s.hasAnalysis) parts.push("ניתוח AI");
                      return (
                        <ItemRow
                          key={s.id}
                          title={`${SESSION_TYPE_HE[s.type] ?? "פגישה"} — ${fmtDateTime(
                            s.startTime
                          )}`}
                          badges={
                            <>
                              {s.hasNote && <Badge variant="secondary">סיכום</Badge>}
                              {s.hasAnalysis && (
                                <Badge variant="secondary">ניתוח AI</Badge>
                              )}
                            </>
                          }
                          onDelete={() =>
                            setPending({
                              type: "session",
                              clientId: inv.client.id,
                              itemId: s.id,
                              label: `${
                                SESSION_TYPE_HE[s.type] ?? "פגישה"
                              } מ-${fmtDateTime(s.startTime)} (${parts.join(" + ")})`,
                            })
                          }
                        />
                      );
                    })}
                  </Section>
                )}

                {/* ניתוח מקיף ללקוח */}
                {inv.comprehensive.has && (
                  <Section
                    icon={<Brain className="h-4 w-4" />}
                    title="ניתוח מקיף ללקוח"
                  >
                    <ItemRow
                      title={`ניתוח מקיף${
                        inv.comprehensive.at
                          ? ` — ${fmtDate(inv.comprehensive.at)}`
                          : ""
                      }`}
                      onDelete={() =>
                        setPending({
                          type: "comprehensive",
                          clientId: inv.client.id,
                          label: "הניתוח המקיף של הלקוח",
                        })
                      }
                    />
                  </Section>
                )}

                {/* ניתוחי שאלונים */}
                {(inv.questionnaireAnalyses.length > 0 ||
                  inv.questionnaireResponseAi.length > 0) && (
                  <Section
                    icon={<ClipboardList className="h-4 w-4" />}
                    title="ניתוחי שאלונים (AI)"
                  >
                    {inv.questionnaireAnalyses.map((q) => (
                      <ItemRow
                        key={q.id}
                        title={`ניתוח שאלון${
                          q.templateName ? `: ${q.templateName}` : ""
                        } — ${fmtDate(q.createdAt)}`}
                        onDelete={() =>
                          setPending({
                            type: "questionnaireAnalysis",
                            clientId: inv.client.id,
                            itemId: q.id,
                            label: `ניתוח שאלון${
                              q.templateName ? `: ${q.templateName}` : ""
                            } מ-${fmtDate(q.createdAt)}`,
                          })
                        }
                      />
                    ))}
                    {inv.questionnaireResponseAi.map((q) => (
                      <ItemRow
                        key={q.id}
                        title={`ניתוח AI על שאלון${
                          q.templateName ? `: ${q.templateName}` : ""
                        } — ${fmtDate(q.createdAt)}`}
                        onDelete={() =>
                          setPending({
                            type: "questionnaireResponseAi",
                            clientId: inv.client.id,
                            itemId: q.id,
                            label: `ניתוח ה-AI על השאלון${
                              q.templateName ? `: ${q.templateName}` : ""
                            } מ-${fmtDate(q.createdAt)}`,
                          })
                        }
                      />
                    ))}
                  </Section>
                )}

                {/* ניתוחי הקלטות */}
                {inv.recordingAnalyses.length > 0 && (
                  <Section icon={<Mic className="h-4 w-4" />} title="ניתוחי הקלטות">
                    {inv.recordingAnalyses.map((a) => (
                      <ItemRow
                        key={a.id}
                        title={`ניתוח הקלטה — ${fmtDate(a.createdAt)}`}
                        onDelete={() =>
                          setPending({
                            type: "recordingAnalysis",
                            clientId: inv.client.id,
                            itemId: a.id,
                            label: `ניתוח הקלטה מ-${fmtDate(a.createdAt)}`,
                          })
                        }
                      />
                    ))}
                  </Section>
                )}

                {/* הכנות פגישה AI */}
                {inv.sessionPreps.length > 0 && (
                  <Section
                    icon={<Brain className="h-4 w-4" />}
                    title="הכנות לפגישה (AI)"
                  >
                    {inv.sessionPreps.map((p) => (
                      <ItemRow
                        key={p.id}
                        title={`הכנה לפגישה — ${fmtDate(p.sessionDate)}`}
                        onDelete={() =>
                          setPending({
                            type: "sessionPrep",
                            clientId: inv.client.id,
                            itemId: p.id,
                            label: `הכנת ה-AI לפגישה מ-${fmtDate(p.sessionDate)}`,
                          })
                        }
                      />
                    ))}
                  </Section>
                )}

                {/* תובנות AI שמורות */}
                {inv.aiInsights.count > 0 && (
                  <Section
                    icon={<Sparkles className="h-4 w-4" />}
                    title="תובנות AI שמורות"
                  >
                    <ItemRow
                      title={`תובנות AI (${inv.aiInsights.count})`}
                      onDelete={() =>
                        setPending({
                          type: "aiInsights",
                          clientId: inv.client.id,
                          label: `כל תובנות ה-AI השמורות (${inv.aiInsights.count})`,
                        })
                      }
                    />
                  </Section>
                )}

                {/* פרופיל קליני — זהירות */}
                {inv.clinicalProfile.has && (
                  <Section
                    icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                    title="פרטי פרופיל קליניים (זהירות)"
                  >
                    <p className="mb-2 text-xs text-muted-foreground">
                      הערות כלליות, אבחנה ראשונית, תוכן אינטייק, הערות גישה
                      טיפולית והקשר תרבותי. אלה פרטי הפרופיל עצמו — מחיקה רק אם
                      אלה גורמים לחסימה.
                    </p>
                    <ItemRow
                      title="הערות / אבחנה / אינטייק / גישה / הקשר תרבותי"
                      onDelete={() =>
                        setPending({
                          type: "clinicalProfile",
                          clientId: inv.client.id,
                          label:
                            "הערות, אבחנה ראשונית, תוכן אינטייק, הערות גישה טיפולית והקשר תרבותי של המטופל",
                          warn: true,
                        })
                      }
                    />
                  </Section>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* דיאלוג אישור — בלי תוכן קליני */}
      <Dialog open={!!pending} onOpenChange={(o) => !deleting && !o && setPending(null)}>
        <DialogContent dir="rtl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              מחיקה לצמיתות
            </DialogTitle>
            <DialogDescription>
              {pending?.warn ? (
                <span className="text-amber-700 dark:text-amber-300">
                  שים/י לב: אלה פרטי הפרופיל הקליני של המטופל.{" "}
                </span>
              ) : null}
              למחוק את {pending?.label}? הפעולה <strong>אינה הפיכה</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={deleting}
            >
              ביטול
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מוחק...
                </>
              ) : (
                "מחק לצמיתות"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ItemRow({
  title,
  badges,
  onDelete,
}: {
  title: string;
  badges?: ReactNode;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate text-sm">{title}</span>
        {badges}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="ml-1 h-4 w-4" />
        מחק
      </Button>
    </div>
  );
}
