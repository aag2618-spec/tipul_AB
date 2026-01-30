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
import { Loader2, AlertCircle, CheckCircle, Calendar, Search, ArrowUpDown, CreditCard, Mail } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { PayClientDebts } from "@/components/payments/pay-client-debts";
import { Input } from "@/components/ui/input";

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
type ViewType = "clients" | "payments";
type SortType = "date" | "amount" | "name";

export default function PaymentsPage() {
  const [clients, setClients] = useState<ClientDebt[]>([]);
  const [filteredClients, setFilteredClients] = useState<ClientDebt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("debts");
  const [view, setView] = useState<ViewType>("clients");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortType>("date");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Optimistic update handler
  const handleOptimisticUpdate = (clientId: string, amountPaid: number) => {
    setClients(prevClients => 
      prevClients.map(client => {
        if (client.id === clientId) {
          return {
            ...client,
            totalDebt: Math.max(0, client.totalDebt - amountPaid),
          };
        }
        return client;
      })
    );
  };

  useEffect(() => {
    fetchClientDebts();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [clients, filter, searchTerm]);

  useEffect(() => {
    // Reset to page 1 when search or filter changes
    setCurrentPage(1);
  }, [searchTerm, filter, sortBy]);

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

    // Apply filter type
    if (filter === "debts") {
      filtered = clients.filter((c) => c.totalDebt > 0);
    } else if (filter === "credits") {
      filtered = clients.filter((c) => c.creditBalance > 0);
    }

    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter((c) => 
        c.fullName.toLowerCase().includes(search) ||
        c.firstName.toLowerCase().includes(search) ||
        c.lastName.toLowerCase().includes(search)
      );
    }

    setFilteredClients(filtered);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate total pending payments count
  const totalPendingPayments = clients.reduce((sum, client) => sum + client.unpaidSessionsCount, 0);

  // Get all pending payments with client info
  let allPendingPayments = clients.flatMap(client => 
    client.unpaidSessions.map(session => ({
      ...session,
      clientId: client.id,
      clientName: client.fullName,
      creditBalance: client.creditBalance,
    }))
  );

  // Apply search to payments
  if (searchTerm) {
    const search = searchTerm.toLowerCase();
    allPendingPayments = allPendingPayments.filter(p => 
      p.clientName.toLowerCase().includes(search)
    );
  }

  // Apply sorting
  allPendingPayments = allPendingPayments.sort((a, b) => {
    switch (sortBy) {
      case "date":
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      case "amount":
        return b.amount - a.amount;
      case "name":
        return a.clientName.localeCompare(b.clientName, "he");
      default:
        return 0;
    }
  });

  // Apply pagination to payments
  const totalPaymentPages = Math.ceil(allPendingPayments.length / itemsPerPage);
  const paginatedPayments = allPendingPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Apply pagination to clients
  const totalClientPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">תשלומים וחובות</h1>
          <p className="text-muted-foreground">
            {totalPendingPayments} תשלומים ממתינים מ-{clients.filter(c => c.totalDebt > 0).length} מטופלים
          </p>
        </div>
      </div>

      <Tabs value={view} onValueChange={(value) => setView(value as ViewType)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payments" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            תשלומים ממתינים ({totalPendingPayments})
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            סיכום לפי מטופל ({clients.filter(c => c.totalDebt > 0).length})
          </TabsTrigger>
        </TabsList>

        {/* Pending Payments Tab */}
        <TabsContent value="payments" className="mt-6">
          {/* Search and Sort Controls */}
          <div className="flex gap-4 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש לפי שם מטופל..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortType)}>
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="h-4 w-4 ml-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">מיון לפי תאריך</SelectItem>
                <SelectItem value="amount">מיון לפי סכום</SelectItem>
                <SelectItem value="name">מיון לפי שם</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3">
            {paginatedPayments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="h-16 w-16 text-green-500 mb-4 opacity-50" />
                  <p className="text-lg font-medium">
                    {searchTerm ? "לא נמצאו תוצאות לחיפוש" : "אין תשלומים ממתינים! 🎉"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              paginatedPayments.map((payment) => (
                <Card key={payment.paymentId} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-center min-w-[60px]">
                          <div className="text-lg font-bold">
                            {format(new Date(payment.date), "d")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(payment.date), "MMM", { locale: he })}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold">{payment.clientName}</h3>
                          <p className="text-sm text-muted-foreground">
                            פגישה מתאריך {format(new Date(payment.date), "dd/MM/yyyy")}
                          </p>
                        </div>
                        <div className="text-left">
                          <div className="text-xl font-bold text-red-600">
                            ₪{payment.amount.toFixed(0)}
                          </div>
                          {payment.creditBalance > 0 && (
                            <p className="text-xs text-green-600">
                              קרדיט: ₪{payment.creditBalance.toFixed(0)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 mr-4">
                        <Button variant="default" size="sm" asChild className="gap-2 bg-green-600 hover:bg-green-700">
                          <Link href={`/dashboard/payments/pay/${payment.clientId}`}>
                            <CreditCard className="h-4 w-4" />
                            שלם עכשיו
                          </Link>
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/clients/${payment.clientId}/send-debt-reminder`, {
                                method: "POST",
                              });
                              if (!res.ok) {
                                const error = await res.json();
                                throw new Error(error.error || "שגיאה בשליחת התזכורת");
                              }
                              toast.success("תזכורת נשלחה בהצלחה למייל המטופל!");
                            } catch (error: any) {
                              toast.error(error.message || "שגיאה בשליחת התזכורת");
                            }
                          }}
                          className="gap-2"
                        >
                          <Mail className="h-4 w-4" />
                          שלח תזכורת
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/clients/${payment.clientId}?tab=payments`}>
                            פרטים
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Pagination for Payments */}
          {totalPaymentPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                הקודם
              </Button>
              <span className="text-sm text-muted-foreground">
                עמוד {currentPage} מתוך {totalPaymentPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPaymentPages, p + 1))}
                disabled={currentPage === totalPaymentPages}
              >
                הבא
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Clients Summary Tab */}
        <TabsContent value="clients" className="mt-6">
          {/* Search and Filter Controls */}
          <div className="flex gap-4 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש לפי שם מטופל..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
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
        {paginatedClients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {searchTerm ? "לא נמצאו תוצאות לחיפוש" : 
                  filter === "debts" ? "אין חובות פתוחים! 🎉" :
                  filter === "credits" ? "אין מטופלים עם קרדיט זמין" :
                  "אין מטופלים במערכת"}
              </p>
            </CardContent>
          </Card>
        ) : (
          paginatedClients.map((client) => (
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
                      asChild
                    >
                      <Link href={`/dashboard/clients/${client.id}?tab=payments`}>
                        היסטוריה
                      </Link>
                    </Button>
                    {client.totalDebt > 0 && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/clients/${client.id}/send-debt-reminder`, {
                                method: "POST",
                              });
                              if (!res.ok) {
                                const error = await res.json();
                                throw new Error(error.error || "שגיאה בשליחת התזכורת");
                              }
                              toast.success(`תזכורת נשלחה בהצלחה ל-${client.fullName}!`);
                            } catch (error: any) {
                              toast.error(error.message || "שגיאה בשליחת התזכורת");
                            }
                          }}
                          className="gap-2"
                        >
                          <Mail className="h-4 w-4" />
                          שלח תזכורת
                        </Button>
                        <PayClientDebts
                          clientId={client.id}
                          clientName={client.fullName}
                          totalDebt={client.totalDebt}
                          creditBalance={client.creditBalance}
                          unpaidPayments={client.unpaidSessions}
                          onPaymentComplete={fetchClientDebts}
                          onOptimisticUpdate={(amount) => handleOptimisticUpdate(client.id, amount)}
                        />
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
          </div>

          {/* Pagination for Clients */}
          {totalClientPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                הקודם
              </Button>
              <span className="text-sm text-muted-foreground">
                עמוד {currentPage} מתוך {totalClientPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalClientPages, p + 1))}
                disabled={currentPage === totalClientPages}
              >
                הבא
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}













