"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight,
  Loader2,
  Building2,
  ExternalLink,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

interface OrgSummary {
  id: string;
  name: string;
}

interface TransferLog {
  id: string;
  organizationId: string;
  organization: OrgSummary;
  clientId: string;
  fromTherapistId: string;
  toTherapistId: string;
  performedById: string;
  fromTherapistNameSnapshot: string;
  toTherapistNameSnapshot: string;
  performedByNameSnapshot: string;
  reason: string | null;
  transferredAt: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
}

export default function ClinicTransfersPage() {
  const [transfers, setTransfers] = useState<TransferLog[]>([]);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (orgFilter !== "ALL") params.set("orgId", orgFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await fetch(`/api/admin/clinics/transfers?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTransfers(data);
    } catch {
      toast.error("שגיאה בטעינת לוג ההעברות");
    } finally {
      setLoading(false);
    }
  }, [orgFilter, fromDate, toDate]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/clinics?limit=500");
        if (res.ok) {
          const data = await res.json();
          setOrgs(data.map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })));
        }
      } catch {
        // ignore — סינון לפי קליניקה פשוט לא יעבוד
      }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(fetchTransfers, 200);
    return () => clearTimeout(t);
  }, [fetchTransfers]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <ArrowLeftRight className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">העברות מטופלים</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "טוען..." : `${transfers.length} העברות בלוג`} — הסטוריה עם snapshot
            של שמות מטפלים
          </p>
        </div>
      </div>

      {/* פילטרים */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            סינון
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">קליניקה</Label>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger>
                <SelectValue placeholder="כל הקליניקות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">כל הקליניקות</SelectItem>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">מתאריך</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">עד תאריך</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* טבלה */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : transfers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">אין העברות מתועדות</p>
            <p className="text-sm text-muted-foreground mt-1">
              העברות נרשמות אוטומטית כאשר בעל/ת קליניקה מעביר/ה מטופל בין מטפלים
              באותה קליניקה.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-right">
                    <th className="px-4 py-2 font-medium">תאריך</th>
                    <th className="px-4 py-2 font-medium">קליניקה</th>
                    <th className="px-4 py-2 font-medium">מ־</th>
                    <th className="px-4 py-2 font-medium">אל</th>
                    <th className="px-4 py-2 font-medium">בוצע ע״י</th>
                    <th className="px-4 py-2 font-medium">סיבה</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {formatDateTime(t.transferredAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/clinics/${t.organization.id}`}
                          className="inline-flex items-center gap-1.5 hover:text-primary"
                        >
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{t.organization.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{t.fromTherapistNameSnapshot}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{t.toTherapistNameSnapshot}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t.performedByNameSnapshot}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground">
                        {t.reason || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/admin/users/${t.clientId}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
