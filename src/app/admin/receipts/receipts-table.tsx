"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ReceiptItem {
  id: string;
  documentNumber: string;
  documentType: string;
  pdfUrl: string | null;
  hasLocalBackup: boolean;
  allocationNumber: string | null;
  amount: number;
  currency: string;
  description: string;
  status: string;
  issuedAt: string;
  subscriberName: string;
  subscriberEmail: string | null;
  issuerBusinessType: string;
  vatAmount: number | null;
}

const documentTypeLabel = (t: string): string => {
  switch (t) {
    case "Receipt":
      return "קבלה";
    case "TaxInvoiceAndReceipt":
      return "חשבונית מס-קבלה";
    case "TaxInvoice":
      return "חשבונית מס";
    case "Refund":
      return "זיכוי";
    default:
      return t;
  }
};

const statusLabel = (s: string): string => {
  switch (s) {
    case "ISSUED":
      return "פעילה";
    case "VOIDED":
      return "בוטלה";
    case "REFUNDED":
      return "זוכתה";
    default:
      return s;
  }
};

export function ReceiptsTable({
  initialItems,
  canVoid,
}: {
  initialItems: ReceiptItem[];
  canVoid: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [voidTarget, setVoidTarget] = useState<ReceiptItem | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleVoid = async () => {
    if (!voidTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/receipts/${voidTarget.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason || "ביטול ידני" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      toast.success("הקבלה בוטלה");
      setItems((prev) =>
        prev.map((it) => (it.id === voidTarget.id ? { ...it, status: "VOIDED" } : it))
      );
      setVoidTarget(null);
      setVoidReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ביטול נכשל");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async (item: ReceiptItem) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/receipts/${item.id}/resend`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        retryAfterSeconds?: number;
      };
      if (res.status === 429) {
        // Cooldown — show as info, not error
        toast.info(body.message ?? "נא להמתין לפני שליחה חוזרת");
        return;
      }
      if (!res.ok) {
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      toast.success("נשלח מחדש למייל הלקוח");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שליחה מחדש נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-right p-3">מספר</th>
              <th className="text-right p-3">לקוח</th>
              <th className="text-right p-3">סוג</th>
              <th className="text-right p-3">סכום</th>
              <th className="text-right p-3">תאריך</th>
              <th className="text-right p-3">סטטוס</th>
              <th className="text-right p-3">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  אין קבלות עדיין
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-mono">
                    <Link href={`/admin/receipts/${it.id}`} className="text-blue-600 hover:underline">
                      #{it.documentNumber}
                    </Link>
                  </td>
                  <td className="p-3">
                    <div>{it.subscriberName}</div>
                    {it.subscriberEmail && (
                      <div className="text-xs text-gray-500">{it.subscriberEmail}</div>
                    )}
                  </td>
                  <td className="p-3">{documentTypeLabel(it.documentType)}</td>
                  <td className="p-3 font-semibold">
                    ₪{it.amount.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
                    {it.vatAmount ? (
                      <div className="text-xs text-gray-500">
                        מע"מ ₪{it.vatAmount.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3">
                    {new Date(it.issuedAt).toLocaleDateString("he-IL", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs ${
                        it.status === "ISSUED"
                          ? "bg-green-100 text-green-800"
                          : it.status === "VOIDED"
                          ? "bg-gray-200 text-gray-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {statusLabel(it.status)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {it.pdfUrl && (
                        <a
                          href={it.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                        >
                          צפה
                        </a>
                      )}
                      {it.status === "ISSUED" && it.subscriberEmail && (
                        <button
                          type="button"
                          onClick={() => handleResend(it)}
                          disabled={busy}
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                        >
                          שלח שוב
                        </button>
                      )}
                      {canVoid && it.status === "ISSUED" && (
                        <button
                          type="button"
                          onClick={() => setVoidTarget(it)}
                          disabled={busy}
                          className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
                        >
                          ביטול
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={voidTarget !== null} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול קבלה #{voidTarget?.documentNumber}</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו תיצור חשבונית זיכוי ב-Cardcom ותסמן את הקבלה כבוטלה.
              <br />
              <strong>הפעולה אינה הפיכה.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="סיבת הביטול (אופציונלי)"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoid} disabled={busy}>
              {busy ? "מבטל..." : "אשר ביטול"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
