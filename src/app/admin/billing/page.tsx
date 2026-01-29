"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { 
  Loader2, 
  Plus, 
  CreditCard,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" | "REFUNDED";
  description: string | null;
  invoiceUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

interface User {
  id: string;
  name: string | null;
  email: string | null;
}

interface BillingStats {
  totalRevenue: number;
  pendingAmount: number;
  overdueAmount: number;
}

export default function AdminBillingPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    userId: "",
    amount: "",
    description: "",
    status: "PENDING" as Payment["status"],
  });

  useEffect(() => {
    fetchData();
    fetchUsers();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/admin/billing");
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments);
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Failed to fetch billing:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/admin/users?limit=100");
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const handleCreate = async () => {
    if (!formData.userId || !formData.amount) {
      toast.error("נא למלא משתמש וסכום");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: formData.userId,
          amount: parseFloat(formData.amount),
          description: formData.description,
          status: formData.status,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }

      toast.success("התשלום נוצר בהצלחה");
      setIsDialogOpen(false);
      setFormData({ userId: "", amount: "", description: "", status: "PENDING" });
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (paymentId: string, newStatus: Payment["status"]) => {
    try {
      const response = await fetch(`/api/admin/billing/${paymentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }

      toast.success("סטטוס התשלום עודכן");
      fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה");
    }
  };

  const getStatusBadge = (status: Payment["status"]) => {
    switch (status) {
      case "PAID":
        return <Badge className="bg-green-500/20 text-green-500">שולם</Badge>;
      case "PENDING":
        return <Badge className="bg-yellow-500/20 text-yellow-500">ממתין</Badge>;
      case "OVERDUE":
        return <Badge className="bg-red-500/20 text-red-500">באיחור</Badge>;
      case "CANCELLED":
        return <Badge className="bg-slate-500/20 text-slate-500">בוטל</Badge>;
      case "REFUNDED":
        return <Badge className="bg-purple-500/20 text-purple-500">הוחזר</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ניהול תשלומים</h1>
          <p className="text-slate-400 mt-1">ניהול תשלומי מנויים</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black">
              <Plus className="ml-2 h-4 w-4" />
              תשלום חדש
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">יצירת תשלום חדש</DialogTitle>
              <DialogDescription>הזן את פרטי התשלום</DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>משתמש</Label>
                <Select
                  value={formData.userId}
                  onValueChange={(value) => setFormData({ ...formData, userId: value })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue placeholder="בחר משתמש" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>סכום (₪)</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              
              <div className="space-y-2">
                <Label>תיאור</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                  placeholder="תיאור התשלום..."
                />
              </div>

              <div className="space-y-2">
                <Label>סטטוס</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: Payment["status"]) => 
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">ממתין</SelectItem>
                    <SelectItem value="PAID">שולם</SelectItem>
                    <SelectItem value="OVERDUE">באיחור</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                className="text-slate-400"
              >
                ביטול
              </Button>
              <Button
                onClick={handleCreate}
                disabled={isSaving}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "צור תשלום"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">סה"כ הכנסות</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              ₪{(stats?.totalRevenue || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">ממתינים לתשלום</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">
              ₪{(stats?.pendingAmount || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">באיחור</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              ₪{(stats?.overdueAmount || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">רשימת תשלומים</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>אין תשלומים</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">משתמש</TableHead>
                  <TableHead className="text-slate-400">סכום</TableHead>
                  <TableHead className="text-slate-400">תיאור</TableHead>
                  <TableHead className="text-slate-400">סטטוס</TableHead>
                  <TableHead className="text-slate-400">שולם בתאריך</TableHead>
                  <TableHead className="text-slate-400">נוצר</TableHead>
                  <TableHead className="text-slate-400">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} className="border-slate-800">
                    <TableCell>
                      <div>
                        <p className="font-medium text-white">{payment.user.name || "ללא שם"}</p>
                        <p className="text-sm text-slate-500">{payment.user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-white">
                      ₪{Number(payment.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-slate-300 max-w-xs truncate">
                      {payment.description || "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell className="text-slate-300">
                      {payment.paidAt 
                        ? format(new Date(payment.paidAt), "dd/MM/yyyy")
                        : "-"
                      }
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {format(new Date(payment.createdAt), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={payment.status}
                        onValueChange={(value: Payment["status"]) => 
                          handleStatusChange(payment.id, value)
                        }
                      >
                        <SelectTrigger className="w-28 bg-slate-800 border-slate-700">
                          <RefreshCw className="h-3 w-3" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDING">ממתין</SelectItem>
                          <SelectItem value="PAID">שולם</SelectItem>
                          <SelectItem value="OVERDUE">באיחור</SelectItem>
                          <SelectItem value="CANCELLED">בוטל</SelectItem>
                          <SelectItem value="REFUNDED">הוחזר</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
