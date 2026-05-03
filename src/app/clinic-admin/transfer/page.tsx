"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftRight,
  Loader2,
  Search,
  Check,
  AlertCircle,
  User,
  Stethoscope,
  Crown,
} from "lucide-react";
import { toast } from "sonner";

type ClinicRole = "OWNER" | "THERAPIST" | "SECRETARY";

interface Member {
  id: string;
  name: string | null;
  email: string;
  clinicRole: ClinicRole | null;
  isBlocked: boolean;
}

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  status: string;
  therapistId: string;
  therapist: { id: string; name: string | null; email: string };
  _count: { therapySessions: number };
}

export default function TransferClientPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [toTherapistId, setToTherapistId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [transferring, setTransferring] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/clinic-admin/clients?${params}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data);
      }
    } catch {
      // ignore
    }
  }, [search]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/clinic-admin/members");
      if (res.ok) {
        const data = await res.json();
        setMembers(
          data.filter(
            (m: Member) =>
              !m.isBlocked && (m.clinicRole === "THERAPIST" || m.clinicRole === "OWNER")
          )
        );
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchMembers(), fetchClients()]);
      setLoading(false);
    })();
  }, [fetchMembers, fetchClients]);

  useEffect(() => {
    const t = setTimeout(fetchClients, 250);
    return () => clearTimeout(t);
  }, [fetchClients]);

  function selectClient(client: Client) {
    setSelectedClient(client);
    setToTherapistId("");
    setReason("");
  }

  async function handleTransfer() {
    if (!selectedClient || !toTherapistId) {
      toast.error("יש לבחור מטופל ומטפל/ת יעד");
      return;
    }
    if (toTherapistId === selectedClient.therapistId) {
      toast.error("המטופל כבר מטופל ע״י המטפל/ת היעד");
      return;
    }
    setTransferring(true);
    try {
      const res = await fetch("/api/clinic-admin/transfer-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient.id,
          toTherapistId,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast.success("המטופל הועבר בהצלחה");
      setSelectedClient(null);
      setToTherapistId("");
      setReason("");
      fetchClients();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהעברה");
    } finally {
      setTransferring(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const targetMembers = selectedClient
    ? members.filter((m) => m.id !== selectedClient.therapistId)
    : members;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <ArrowLeftRight className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">העברת מטופל בין מטפלים</h1>
          <p className="text-sm text-muted-foreground">
            העברה פנימית בקליניקה — נרשמת ב-ClientTransferLog
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* בחירת מטופל */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              1. בחירת מטופל
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedClient ? (
              <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {selectedClient.firstName} {selectedClient.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedClient.phone || selectedClient.email || "—"}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedClient(null);
                      setToTherapistId("");
                    }}
                  >
                    החלף
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground border-t border-border pt-2">
                  כעת אצל:{" "}
                  <span className="font-medium text-foreground">
                    {selectedClient.therapist.name || selectedClient.therapist.email}
                  </span>
                  {" "}·{" "}
                  {selectedClient._count.therapySessions} פגישות בהיסטוריה
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="חיפוש מטופל לפי שם/טלפון/אימייל..."
                    className="pr-9"
                  />
                </div>
                <div className="border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                  {clients.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      {search.trim() ? "אין תוצאות" : "אין מטופלים בקליניקה"}
                    </div>
                  ) : (
                    clients.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => selectClient(c)}
                        className="w-full text-right px-3 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-0"
                      >
                        <div className="font-medium text-sm">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          אצל: {c.therapist.name || c.therapist.email} ·{" "}
                          {c._count.therapySessions} פגישות
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* בחירת יעד + סיבה */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              2. בחירת מטפל/ת יעד
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedClient ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                בחר/י מטופל תחילה
              </p>
            ) : targetMembers.length === 0 ? (
              <p className="text-sm text-amber-400 inline-flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                אין מטפלים נוספים בקליניקה. הוסף/י מטפל ב-&ldquo;חברי קליניקה&rdquo;.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>מטפל/ת יעד</Label>
                  <Select value={toTherapistId} onValueChange={setToTherapistId}>
                    <SelectTrigger>
                      <SelectValue placeholder="בחר/י מטפל/ת..." />
                    </SelectTrigger>
                    <SelectContent>
                      {targetMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.clinicRole === "OWNER" && "👑 "}
                          {m.name || m.email}
                          {m.clinicRole === "OWNER" && " (בעלים)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>סיבת ההעברה (אופציונלי)</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="לדוגמה: התאמה טובה יותר עם מטפל אחר, עומס יתר..."
                  />
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-muted-foreground">
                  <strong className="text-amber-400">לתשומת לב:</strong> פגישות עבר נשארות
                  משויכות למטפל המקורי (היסטוריה). רק פגישות עתידיות יוקצו למטפל היעד.
                </div>

                <Button
                  onClick={handleTransfer}
                  disabled={!toTherapistId || transferring}
                  className="w-full"
                >
                  {transferring ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="ml-2 h-4 w-4" />
                  )}
                  בצע/י העברה
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* רשימת מטפלים בקליניקה */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            מטפלים בקליניקה ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {members.map((m) => (
              <div key={m.id} className="p-3 bg-muted/30 rounded-md text-sm">
                <div className="flex items-center gap-2">
                  {m.clinicRole === "OWNER" ? (
                    <Crown className="h-4 w-4 text-amber-400" />
                  ) : (
                    <Stethoscope className="h-4 w-4 text-blue-400" />
                  )}
                  <span className="font-medium truncate">{m.name || "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{m.email}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
