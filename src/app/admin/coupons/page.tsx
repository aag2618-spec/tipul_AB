"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Ticket,
  Copy,
  Trash2,
  Users,
  Calendar,
  RefreshCw,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

interface CouponUsage {
  id: string;
  usedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    createdAt: string;
  };
}

interface Coupon {
  id: string;
  code: string;
  name: string;
  type: "SINGLE_USE" | "LIMITED" | "UNLIMITED";
  maxUses: number | null;
  usedCount: number;
  discount: number;
  trialDays: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
  usages: CouponUsage[];
  _count: {
    usages: number;
  };
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isUsagesOpen, setIsUsagesOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "LIMITED" as "SINGLE_USE" | "LIMITED" | "UNLIMITED",
    maxUses: "10",
    trialDays: "30",
    discount: "0",
    validUntil: "",
  });

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      const response = await fetch("/api/admin/coupons");
      if (response.ok) {
        const data = await response.json();
        setCoupons(data);
      }
    } catch (error) {
      console.error("Error fetching coupons:", error);
      toast.error("שגיאה בטעינת הקופונים");
    } finally {
      setIsLoading(false);
    }
  };

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, code }));
  };

  const handleCreate = async () => {
    if (!formData.code || !formData.name) {
      toast.error("נא למלא קוד ושם");
      return;
    }

    try {
      const response = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formData.code,
          name: formData.name,
          type: formData.type,
          maxUses: formData.type === "UNLIMITED" ? null : parseInt(formData.maxUses),
          trialDays: parseInt(formData.trialDays),
          discount: parseInt(formData.discount),
          validUntil: formData.validUntil || null,
        }),
      });

      if (response.ok) {
        toast.success("הקופון נוצר בהצלחה");
        setIsCreateOpen(false);
        setFormData({
          code: "",
          name: "",
          type: "LIMITED",
          maxUses: "10",
          trialDays: "30",
          discount: "0",
          validUntil: "",
        });
        fetchCoupons();
      } else {
        const data = await response.json();
        toast.error(data.message || "שגיאה ביצירת הקופון");
      }
    } catch (error) {
      console.error("Error creating coupon:", error);
      toast.error("שגיאה ביצירת הקופון");
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    try {
      const response = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });

      if (response.ok) {
        toast.success(coupon.isActive ? "הקופון הושבת" : "הקופון הופעל");
        fetchCoupons();
      }
    } catch (error) {
      console.error("Error toggling coupon:", error);
      toast.error("שגיאה בעדכון הקופון");
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("האם למחוק את הקופון?")) return;

    try {
      const response = await fetch(`/api/admin/coupons/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("הקופון נמחק");
        fetchCoupons();
      }
    } catch (error) {
      console.error("Error deleting coupon:", error);
      toast.error("שגיאה במחיקת הקופון");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("הקוד הועתק ללוח");
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "SINGLE_USE":
        return "חד-פעמי";
      case "LIMITED":
        return "מוגבל";
      case "UNLIMITED":
        return "ללא הגבלה";
      default:
        return type;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "SINGLE_USE":
        return <Badge variant="secondary">חד-פעמי</Badge>;
      case "LIMITED":
        return <Badge variant="outline">מוגבל</Badge>;
      case "UNLIMITED":
        return <Badge className="bg-green-100 text-green-800">ללא הגבלה</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Ticket className="h-8 w-8" />
            ניהול קופונים
          </h1>
          <p className="text-muted-foreground mt-1">
            צור וניהל קודי קופון להרשמה למערכת
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              קופון חדש
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>יצירת קופון חדש</DialogTitle>
              <DialogDescription>
                צור קוד קופון חדש להרשמה למערכת
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>קוד הקופון</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.code}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="PROMO2026"
                    className="uppercase"
                  />
                  <Button variant="outline" onClick={generateCode}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>שם/תיאור</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="קופון לד״ר כהן"
                />
              </div>

              <div className="space-y-2">
                <Label>סוג קופון</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: "SINGLE_USE" | "LIMITED" | "UNLIMITED") =>
                    setFormData((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE_USE">חד-פעמי (לקוח אחד)</SelectItem>
                    <SelectItem value="LIMITED">מוגבל (מספר שימושים)</SelectItem>
                    <SelectItem value="UNLIMITED">ללא הגבלה</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.type === "LIMITED" && (
                <div className="space-y-2">
                  <Label>מקסימום שימושים</Label>
                  <Input
                    type="number"
                    value={formData.maxUses}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, maxUses: e.target.value }))
                    }
                    min="1"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ימי ניסיון</Label>
                  <Input
                    type="number"
                    value={formData.trialDays}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        trialDays: e.target.value,
                      }))
                    }
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>אחוז הנחה</Label>
                  <Input
                    type="number"
                    value={formData.discount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        discount: e.target.value,
                      }))
                    }
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>תאריך תפוגה (אופציונלי)</Label>
                <Input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      validUntil: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                ביטול
              </Button>
              <Button onClick={handleCreate}>יצירה</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">סה״כ קופונים</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{coupons.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">קופונים פעילים</CardTitle>
            <Ticket className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {coupons.filter((c) => c.isActive).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">סה״כ שימושים</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {coupons.reduce((acc, c) => acc + c.usedCount, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">השבוע</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {coupons.reduce((acc, c) => {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return (
                  acc +
                  c.usages.filter((u) => new Date(u.usedAt) > weekAgo).length
                );
              }, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Coupons Table */}
      <Card>
        <CardHeader>
          <CardTitle>רשימת קופונים</CardTitle>
          <CardDescription>כל הקופונים במערכת</CardDescription>
        </CardHeader>
        <CardContent>
          {coupons.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>אין קופונים עדיין</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsCreateOpen(true)}
              >
                צור קופון ראשון
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>קוד</TableHead>
                  <TableHead>שם</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>שימושים</TableHead>
                  <TableHead>ימי ניסיון</TableHead>
                  <TableHead>תפוגה</TableHead>
                  <TableHead>פעיל</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                          {coupon.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyCode(coupon.code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{coupon.name}</TableCell>
                    <TableCell>{getTypeBadge(coupon.type)}</TableCell>
                    <TableCell>
                      {coupon.usedCount}
                      {coupon.maxUses && ` / ${coupon.maxUses}`}
                    </TableCell>
                    <TableCell>{coupon.trialDays} ימים</TableCell>
                    <TableCell>
                      {coupon.validUntil
                        ? new Date(coupon.validUntil).toLocaleDateString("he-IL")
                        : "ללא"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={coupon.isActive}
                        onCheckedChange={() => toggleActive(coupon)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCoupon(coupon);
                            setIsUsagesOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteCoupon(coupon.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Usages Dialog */}
      <Dialog open={isUsagesOpen} onOpenChange={setIsUsagesOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              שימושים בקופון: {selectedCoupon?.code}
            </DialogTitle>
            <DialogDescription>{selectedCoupon?.name}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedCoupon?.usages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                עדיין לא השתמשו בקופון זה
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם</TableHead>
                    <TableHead>אימייל</TableHead>
                    <TableHead>תאריך שימוש</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedCoupon?.usages.map((usage) => (
                    <TableRow key={usage.id}>
                      <TableCell>{usage.user.name || "-"}</TableCell>
                      <TableCell>{usage.user.email || "-"}</TableCell>
                      <TableCell>
                        {new Date(usage.usedAt).toLocaleDateString("he-IL", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
