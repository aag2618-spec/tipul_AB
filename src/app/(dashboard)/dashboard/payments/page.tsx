"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle, CheckCircle, History, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { BulkPaymentDialog } from "@/components/payments/bulk-payment-dialog";
import { PaymentHistoryDialog } from "@/components/payments/payment-history-dialog";

interface ClientDebt {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidSessionsCount: number;
  unpaidSessions: Array<{
    paymentId: string;
    amount: number;
    date: Date;
    sessionId: string | null;
  }>;
}

type FilterType = "all" | "debts" | "credits";

export default function PaymentsPage() {
  const [clients, setClients] = useState<ClientDebt[]>([]);
  const [filteredClients, setFilteredClients] = useState<ClientDebt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("debts");
  const [selectedClient, setSelectedClient] = useState<ClientDebt | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  useEffect(() => {
    fetchClientDebts();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [clients, filter]);

  const fetchClientDebts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/payments/client-debts");
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      } else {
        toast.error("שגיאה בטעינת נתונים");
      }
    } catch (error) {
      console.error("Error fetching client debts:", error);
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilter = () => {
    let filtered = clients;

    if (filter === "debts") {
      filtered = clients.filter((c) => c.totalDebt > 0);
    } else if (filter === "credits") {
      filtered = clients.filter((c) => c.creditBalance > 0);
    }

    setFilteredClients(filtered);
  };

  const handlePaymentSuccess = () => {
    setShowPaymentDialog(false);
    setSelectedClient(null);
    fetchClientDebts();
    toast.success("התשלום עודכן בהצלחה");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">תשלומים וחובות</h1>
          <p className="text-muted-foreground">סיכום חובות וקרדיט לפי מטופל</p>
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as FilterType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הצג הכל ({clients.length})</SelectItem>
            <SelectItem value="debts">
              רק חובות ({clients.filter((c) => c.totalDebt > 0).length})
            </SelectItem>
            <SelectItem value="credits">
              רק קרדיט ({clients.filter((c) => c.creditBalance > 0).length})
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4">
        {filteredClients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {filter === "debts" && "אין חובות פתוחים! 🎉"}
                {filter === "credits" && "אין מטופלים עם קרדיט זמין"}
                {filter === "all" && "אין מטופלים במערכת"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredClients.map((client) => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">
                        {client.fullName}
                      </h3>
                      {client.totalDebt > 0 && (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 ml-1" />
                          חוב
                        </Badge>
                      )}
                      {client.creditBalance > 0 && (
                        <Badge className="bg-green-100 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 ml-1" />
                          קרדיט
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">חוב:</span>
                        <span
                          className={`font-bold ${
                            client.totalDebt > 0
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          ₪{client.totalDebt.toFixed(0)}
                        </span>
                      </div>
                      <div className="h-4 w-px bg-border" />
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">קרדיט זמין:</span>
                        <span className="font-bold text-green-600">
                          ₪{client.creditBalance.toFixed(0)}
                        </span>
                      </div>
                    </div>

                    {client.unpaidSessionsCount > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {client.unpaidSessionsCount} פגישות שטרם שולמו
                        {client.creditBalance > 0 &&
                          client.totalDebt > 0 &&
                          ` (ניתן לשלם ₪${Math.min(
                            client.creditBalance,
                            client.totalDebt
                          ).toFixed(0)} בקרדיט)`}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedClient(client);
                        setShowHistoryDialog(true);
                      }}
                    >
                      <History className="h-4 w-4 ml-2" />
                      היסטוריה
                    </Button>
                    {client.totalDebt > 0 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedClient(client);
                          setShowPaymentDialog(true);
                        }}
                      >
                        <CreditCard className="h-4 w-4 ml-2" />
                        פירוט ותשלום
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Bulk Payment Dialog */}
      {selectedClient && showPaymentDialog && (
        <BulkPaymentDialog
          client={selectedClient}
          open={showPaymentDialog}
          onClose={() => {
            setShowPaymentDialog(false);
            setSelectedClient(null);
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Payment History Dialog */}
      {selectedClient && showHistoryDialog && (
        <PaymentHistoryDialog
          clientId={selectedClient.id}
          clientName={selectedClient.fullName}
          open={showHistoryDialog}
          onClose={() => {
            setShowHistoryDialog(false);
            setSelectedClient(null);
          }}
        />
      )}
    </div>
  );
}
















