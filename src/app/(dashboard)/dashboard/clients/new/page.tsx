"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, Save, FileText } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function NewClientPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    birthDate: "",
    address: "",
    notes: "",
    status: "ACTIVE",
    defaultSessionPrice: "",
  });
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("נא להזין שם מטופל");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "אירעה שגיאה");
      }

      const client = await response.json();
      setCreatedClientId(client.id);
      toast.success("המטופל נוסף בהצלחה");
      router.push(`/dashboard/clients/${client.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/clients">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מטופל חדש</h1>
          <p className="text-muted-foreground">הוסף מטופל חדש למערכת</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>פרטים אישיים</CardTitle>
            <CardDescription>מלא את הפרטים הבסיסיים של המטופל</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">שם מלא *</Label>
              <Input
                id="name"
                name="name"
                placeholder="ישראל ישראלי"
                value={formData.name}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">טלפון</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="050-1234567"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={isLoading}
                  dir="ltr"
                  className="text-left"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">אימייל</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={isLoading}
                  dir="ltr"
                  className="text-left"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="birthDate">תאריך לידה</Label>
                <Input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={handleChange}
                  disabled={isLoading}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">כתובת</Label>
                <Input
                  id="address"
                  name="address"
                  placeholder="עיר, רחוב"
                  value={formData.address}
                  onChange={handleChange}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">סטטוס</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר סטטוס" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">התחיל טיפול</SelectItem>
                    <SelectItem value="WAITING">ממתין בתור</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultSessionPrice">מחיר פגישה ברירת מחדל (₪)</Label>
                <Input
                  id="defaultSessionPrice"
                  name="defaultSessionPrice"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="300"
                  value={formData.defaultSessionPrice}
                  onChange={handleChange}
                  disabled={isLoading}
                  dir="ltr"
                  className="text-left"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">הערות</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="הערות נוספות על המטופל..."
                value={formData.notes}
                onChange={handleChange}
                disabled={isLoading}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Intake Questionnaire Notice */}
        <Card className="mt-6 border-dashed border-primary/50 bg-primary/5">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">תשאול ראשוני</p>
                <p className="text-sm text-muted-foreground">
                  לאחר יצירת המטופל, תוכל למלא שאלון תשאול ראשוני
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4 mt-6">
          <Button type="button" variant="outline" asChild disabled={isLoading}>
            <Link href="/dashboard/clients">ביטול</Link>
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="ml-2 h-4 w-4" />
                שמור מטופל
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}













