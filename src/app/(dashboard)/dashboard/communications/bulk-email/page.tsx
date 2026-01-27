"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Loader2, Send, Eye, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Client {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

// תבניות מיילים מוכנות
const EMAIL_TEMPLATES = [
  {
    id: "custom",
    name: "מייל חופשי",
    subject: "",
    content: "",
  },
  {
    id: "holiday",
    name: "ברכת חג",
    subject: "ברכת חג שמח",
    content: "שלום {name},\n\nברכות חמות לרגל החג הקרוב.\n\nאני מאחל/ת לך חג שמח ומלא באושר.\n\nבברכה",
  },
  {
    id: "update",
    name: "עדכון כללי",
    subject: "עדכון חשוב",
    content: "שלום {name},\n\nרציתי לעדכן אותך בנושא חשוב:\n\n[כתוב כאן את העדכון]\n\nאשמח לשמוע ממך אם יש שאלות.\n\nבברכה",
  },
  {
    id: "schedule_change",
    name: "שינוי בלוח",
    subject: "שינוי בלוח הזמנים",
    content: "שלום {name},\n\nרציתי לעדכן אותך על שינוי בלוח הזמנים שלי.\n\nאשמח לתאם איתך מועד חדש במידת הצורך.\n\nבברכה",
  },
  {
    id: "resources",
    name: "משאבים מועילים",
    subject: "משאבים שחשבתי שיעניינו אותך",
    content: "שלום {name},\n\nרציתי לשתף איתך כמה משאבים שחשבתי שיכולים לעזור לך:\n\n[הוסף קישורים/משאבים כאן]\n\nמקווה שתמצא/י את זה מועיל.\n\nבברכה",
  },
];

export default function BulkEmailPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    subject: "",
    content: "",
  });

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await fetch("/api/clients");
      if (response.ok) {
        const data = await response.json();
        // Filter only clients with email
        const clientsWithEmail = data.filter((c: Client) => c.email);
        setClients(clientsWithEmail);
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
      toast.error("שגיאה בטעינת רשימת מטופלים");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = EMAIL_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setFormData({
        subject: template.subject,
        content: template.content,
      });
    }
  };

  const toggleClient = (clientId: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedClients(newSelected);
  };

  const toggleAll = () => {
    if (selectedClients.size === filteredClients.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(filteredClients.map(c => c.id)));
    }
  };

  const replaceVariables = (text: string, client: Client) => {
    return text.replace(/{name}/g, client.firstName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.subject || !formData.content) {
      toast.error("נא למלא את כל השדות");
      return;
    }

    if (selectedClients.size === 0) {
      toast.error("נא לבחור לפחות מטופל אחד");
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/email/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientIds: Array.from(selectedClients),
          subject: formData.subject,
          content: formData.content,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const result = await response.json();
      toast.success(`${result.sent} מיילים נשלחו בהצלחה!`);
      router.push("/dashboard/communications");
    } catch (error) {
      console.error("Bulk send error:", error);
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה בשליחת המיילים");
    } finally {
      setIsSending(false);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedClientsData = clients.filter(c => selectedClients.has(c.id));

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/communications">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            שליחה קבוצתית
          </h1>
          <p className="text-muted-foreground">שלח מייל למספר מטופלים בבת אחת</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Client Selection */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>בחר מטופלים</span>
              <Badge variant="secondary">{selectedClients.size} נבחרו</Badge>
            </CardTitle>
            <CardDescription>
              {clients.length} מטופלים עם מייל
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="חפש מטופל..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAll}
              className="w-full"
            >
              {selectedClients.size === filteredClients.length ? "בטל הכל" : "בחר הכל"}
            </Button>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center gap-2 p-2 rounded border hover:bg-accent cursor-pointer"
                  onClick={() => toggleClient(client.id)}
                >
                  <Checkbox
                    checked={selectedClients.has(client.id)}
                    onCheckedChange={() => toggleClient(client.id)}
                  />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{client.name}</div>
                    <div className="text-xs text-muted-foreground">{client.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right: Email Compose */}
        <form onSubmit={handleSubmit} className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                כתוב הודעה
              </CardTitle>
              <CardDescription>
                ההודעה תישלח ל-{selectedClients.size} מטופלים
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template Selection */}
              <div className="space-y-2">
                <Label htmlFor="template" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  תבניות מוכנות
                </Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                  <SelectTrigger id="template">
                    <SelectValue placeholder="בחר תבנית" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  💡 טיפ: השתמש ב-{"{name}"} כדי להוסיף את שם המטופל
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">נושא</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="נושא ההודעה..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">תוכן ההודעה</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="כתוב את ההודעה כאן..."
                  rows={12}
                  className="font-mono"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowPreview(true)}
                  disabled={!formData.subject || !formData.content || selectedClients.size === 0}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  תצוגה מקדימה
                </Button>
                <Button type="submit" disabled={isSending || selectedClients.size === 0} className="flex-1 gap-2">
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      שולח ל-{selectedClients.size} מטופלים...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      שלח ל-{selectedClients.size} מטופלים
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  ביטול
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>תצוגה מקדימה - {selectedClientsData.length} נמענים</DialogTitle>
            <DialogDescription>
              מוודא שהכל נראה טוב לפני השליחה
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedClientsData.slice(0, 3).map((client) => (
              <div key={client.id} className="p-4 bg-slate-50 rounded-lg border">
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">אל: </span>
                    <span className="font-medium">{client.email}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">נושא: </span>
                    <span className="font-bold">{replaceVariables(formData.subject, client)}</span>
                  </div>
                  <div className="border-t pt-2">
                    <div 
                      className="bg-white p-3 rounded whitespace-pre-wrap"
                      dir="rtl"
                    >
                      {replaceVariables(formData.content, client)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {selectedClientsData.length > 3 && (
              <div className="text-center text-muted-foreground text-sm">
                ועוד {selectedClientsData.length - 3} מטופלים נוספים...
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-4">
            <Button onClick={() => setShowPreview(false)} variant="outline" className="flex-1">
              חזור לעריכה
            </Button>
            <Button 
              onClick={() => {
                setShowPreview(false);
                handleSubmit(new Event('submit') as any);
              }} 
              className="flex-1 gap-2"
            >
              <Send className="h-4 w-4" />
              נראה מצוין, שלח לכולם!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
