"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  address: string | null;
  status: string;
  defaultSessionPrice: number | null;
  notes: string | null;
  initialDiagnosis: string | null;
  intakeNotes: string | null;
}

export default function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    birthDate: "",
    address: "",
    status: "ACTIVE",
    defaultSessionPrice: "",
    notes: "",
    initialDiagnosis: "",
  });

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const response = await fetch(`/api/clients/${id}`);
        if (response.ok) {
          const data = await response.json();
          setClient(data);
          setFormData({
            name: data.name || "",
            phone: data.phone || "",
            email: data.email || "",
            birthDate: data.birthDate ? data.birthDate.split("T")[0] : "",
            address: data.address || "",
            status: data.status || "ACTIVE",
            defaultSessionPrice: data.defaultSessionPrice ? String(data.defaultSessionPrice) : "",
            notes: data.notes || "",
            initialDiagnosis: data.initialDiagnosis || "",
          });
        }
      } catch (error) {
        console.error("Failed to fetch client:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClient();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("נא להזין שם מטופל");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          birthDate: formData.birthDate || null,
          defaultSessionPrice: formData.defaultSessionPrice ? parseFloat(formData.defaultSessionPrice) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בעדכון");
      }

      toast.success("פרטי המטופל עודכנו בהצלחה");
      router.push(`/dashboard/clients/${id}`);
    } catch (error) {
      console.error("Update error:", error);
      toast.error("אירעה שגיאה בעדכון");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">מטופל לא נמצא</p>
        <Button asChild>
          <Link href="/dashboard/clients">חזרה לרשימה</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/clients/${id}`}>
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">עריכת מטופל</h1>
          <p className="text-muted-foreground">{client.name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>פרטים אישיים</CardTitle>
            <CardDescription>מידע בסיסי על המטופל</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">שם מלא *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="שם המטופל"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">טלפון</Label>
                <Input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="050-0000000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">אימייל</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate">תאריך לידה</Label>
                <Input
                  id="birthDate"
                  type="date"
                  dir="ltr"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address">כתובת</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="כתובת מגורים"
                />
              </div>

              <div className="space-y-2">
                <Label>סטטוס</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">התחיל טיפול</SelectItem>
                    <SelectItem value="WAITING">ממתין בתור</SelectItem>
                    <SelectItem value="INACTIVE">לא פעיל</SelectItem>
                    <SelectItem value="ARCHIVED">בארכיון</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultSessionPrice">מחיר פגישה ברירת מחדל (₪)</Label>
              <Input
                id="defaultSessionPrice"
                type="number"
                min="0"
                step="1"
                dir="ltr"
                className="text-left"
                value={formData.defaultSessionPrice}
                onChange={(e) => setFormData({ ...formData, defaultSessionPrice: e.target.value })}
                placeholder="300"
              />
              <p className="text-xs text-muted-foreground">
                המחיר ימולא אוטומטית בעת יצירת פגישה חדשה
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card>
          <CardHeader>
            <CardTitle>אבחון ראשוני</CardTitle>
            <CardDescription>האבחון הראשוני שלך לגבי המטופל</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.initialDiagnosis}
              onChange={(e) => setFormData({ ...formData, initialDiagnosis: e.target.value })}
              placeholder="תאר את האבחון הראשוני שלך..."
              rows={5}
            />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>הערות נוספות</CardTitle>
            <CardDescription>מידע נוסף על המטופל</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות נוספות..."
              rows={4}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            ביטול
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="ml-2 h-4 w-4" />
                שמור שינויים
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}






