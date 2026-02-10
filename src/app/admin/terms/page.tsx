"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  FileCheck, 
  Search, 
  ChevronRight, 
  ChevronLeft, 
  Shield, 
  Eye,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface TermsRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  termsVersion: string;
  termsType: string;
  acceptedContent: string;
  action: string;
  planSelected: string | null;
  billingMonths: number | null;
  amountAgreed: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export default function TermsAcceptancePage() {
  const [records, setRecords] = useState<TermsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchUserId, setSearchUserId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<TermsRecord | null>(null);

  useEffect(() => {
    fetchRecords();
  }, [page]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (searchUserId.trim()) {
        params.set("userId", searchUserId.trim());
      }
      
      const res = await fetch(`/api/admin/terms?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      } else {
        toast.error("שגיאה בטעינת הנתונים");
      }
    } catch {
      toast.error("שגיאה בטעינת הנתונים");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchRecords();
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("he-IL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "SUBSCRIPTION_CREATE": return "יצירת מנוי";
      case "SUBSCRIPTION_UPGRADE": return "שדרוג מנוי";
      case "SUBSCRIPTION_RENEW": return "חידוש מנוי";
      default: return action;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "SUBSCRIPTION_TERMS": return "תנאי מנוי";
      case "PRIVACY_POLICY": return "מדיניות פרטיות";
      case "CANCELLATION_POLICY": return "מדיניות ביטול";
      default: return type;
    }
  };

  const exportCSV = () => {
    if (records.length === 0) return;
    
    const headers = ["תאריך", "מייל", "שם", "סוג", "פעולה", "מסלול", "חודשים", "סכום", "IP", "גרסה"];
    const rows = records.map(r => [
      formatDate(r.createdAt),
      r.userEmail,
      r.userName || "-",
      getTypeLabel(r.termsType),
      getActionLabel(r.action),
      r.planSelected || "-",
      r.billingMonths?.toString() || "-",
      r.amountAgreed ? `₪${r.amountAgreed}` : "-",
      r.ipAddress || "-",
      r.termsVersion,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `terms-acceptance-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("הקובץ הורד בהצלחה");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            אישורי תנאי שימוש
          </h1>
          <p className="text-muted-foreground">
            הוכחה חוקית על אישור תנאים - {total} רשומות סה״כ
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={records.length === 0}>
          <Download className="h-4 w-4 ml-1" />
          ייצוא CSV
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2 items-center text-sm text-blue-800 dark:text-blue-300">
            <Shield className="h-4 w-4 shrink-0" />
            <span>
              רשומות אלו הן <strong>הוכחה חוקית</strong> שהמשתמש אישר את התנאים. 
              הן כוללות תאריך, IP, דפדפן, ומה בדיוק אושר. 
              <strong> לא ניתן למחוק או לערוך רשומות אלו.</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder="חיפוש לפי User ID..."
          value={searchUserId}
          onChange={(e) => setSearchUserId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={handleSearch}>
          <Search className="h-4 w-4 ml-1" />
          חפש
        </Button>
        {searchUserId && (
          <Button variant="ghost" onClick={() => { setSearchUserId(""); setPage(1); setTimeout(fetchRecords, 0); }}>
            נקה
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>אין רשומות אישור תנאים</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">תאריך</TableHead>
                  <TableHead className="text-right">משתמש</TableHead>
                  <TableHead className="text-right">פעולה</TableHead>
                  <TableHead className="text-right">מסלול</TableHead>
                  <TableHead className="text-right">סכום</TableHead>
                  <TableHead className="text-right">גרסה</TableHead>
                  <TableHead className="text-right">IP</TableHead>
                  <TableHead className="text-center">פרטים</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-sm">
                      {formatDate(record.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">{record.userName || "-"}</div>
                        <div className="text-xs text-muted-foreground">{record.userEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {getActionLabel(record.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {record.planSelected || "-"}
                      {record.billingMonths && record.billingMonths > 1 && (
                        <span className="text-xs text-muted-foreground mr-1">
                          ({record.billingMonths} חו׳)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {record.amountAgreed ? `₪${record.amountAgreed}` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        v{record.termsVersion}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {record.ipAddress || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedRecord(record)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronRight className="h-4 w-4" />
            הקודם
          </Button>
          <span className="text-sm text-muted-foreground">
            עמוד {page} מתוך {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            הבא
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              פרטי אישור תנאים
            </DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">שם משתמש:</span>
                  <div className="font-medium">{selectedRecord.userName || "-"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">מייל:</span>
                  <div className="font-medium">{selectedRecord.userEmail}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">תאריך אישור:</span>
                  <div className="font-medium">{formatDate(selectedRecord.createdAt)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">גרסת תנאים:</span>
                  <div className="font-medium">v{selectedRecord.termsVersion}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">סוג תנאים:</span>
                  <div className="font-medium">{getTypeLabel(selectedRecord.termsType)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">פעולה:</span>
                  <div className="font-medium">{getActionLabel(selectedRecord.action)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">מסלול:</span>
                  <div className="font-medium">{selectedRecord.planSelected || "-"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">סכום:</span>
                  <div className="font-medium">{selectedRecord.amountAgreed ? `₪${selectedRecord.amountAgreed}` : "-"}</div>
                </div>
              </div>
              
              <div className="border-t pt-3">
                <span className="text-muted-foreground">מה אושר:</span>
                <div className="mt-1 p-3 bg-muted rounded-md text-sm">
                  {selectedRecord.acceptedContent}
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">פרטי זיהוי (הוכחה חוקית)</div>
                <div>
                  <span className="text-muted-foreground text-xs">IP Address:</span>
                  <div className="font-mono text-xs">{selectedRecord.ipAddress || "N/A"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">User Agent:</span>
                  <div className="font-mono text-xs break-all">{selectedRecord.userAgent || "N/A"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Record ID:</span>
                  <div className="font-mono text-xs">{selectedRecord.id}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
