"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Loader2, Send, Eye, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  name?: string | null;
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
    id: "reminder",
    name: "תזכורת לפגישה",
    subject: "תזכורת לפגישה הקרובה",
    content: "שלום {שם},\n\nרציתי להזכיר לך את הפגישה הקרובה שלנו.\n\nאשמח לראותך!\n\nבברכה",
  },
  {
    id: "thankyou",
    name: "תודה על הפגישה",
    subject: "תודה על הפגישה",
    content: "שלום {שם},\n\nתודה על הפגישה היום. היה נעים לראותך.\n\nנתראה בפגישה הבאה!\n\nבברכה",
  },
  {
    id: "cancellation",
    name: "ביטול פגישה",
    subject: "ביטול פגישה",
    content: "שלום {שם},\n\nלצערי, אצטרך לבטל את הפגישה שלנו.\n\nאשמח לתאם מועד חלופי בהקדם.\n\nסליחה על אי הנוחות,\nבברכה",
  },
  {
    id: "resources",
    name: "שליחת משאבים",
    subject: "משאבים שדיברנו עליהם",
    content: "שלום {שם},\n\nכפי שהבטחתי, הנה החומרים שדיברנו עליהם בפגישה.\n\nאשמח לשמוע את המחשבות שלך.\n\nבברכה",
  },
  {
    id: "followup",
    name: "מעקב אחרי פגישה",
    subject: "איך אתה מרגיש?",
    content: "שלום {שם},\n\nרציתי לשאול איך אתה מרגיש אחרי הפגישה שלנו.\n\nאם יש משהו שתרצה לשתף או לדון בו, אני כאן.\n\nבברכה",
  },
];

export default function SendEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [formData, setFormData] = useState({
    subject: "",
    content: "",
  });

  const replaceVariables = (text: string) => {
    return text.replace(/{שם}/g, client?.firstName || "").replace(/{name}/g, client?.firstName || "");
  };

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const response = await fetch(`/api/clients/${id}`);
        if (response.ok) {
          const data = await response.json();
          setClient(data);
        }
      } catch (error) {
        console.error("Failed to fetch client:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClient();
  }, [id]);

  // טעינת תבנית
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.subject || !formData.content) {
      toast.error("נא למלא את כל השדות");
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: id,
          subject: formData.subject,
          content: formData.content,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      toast.success("המייל נשלח בהצלחה");
      router.push(`/dashboard/clients/${id}`);
    } catch (error) {
      console.error("Send email error:", error);
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה בשליחת המייל");
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client?.email) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">למטופל אין כתובת מייל</p>
        <Button asChild>
          <Link href={`/dashboard/clients/${id}`}>חזרה</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/clients/${id}`}>
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">שלח מייל ל{client.firstName} {client.lastName}</h1>
          <p className="text-muted-foreground">{client.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              כתוב הודעה
            </CardTitle>
            <CardDescription>המייל ישלח ישירות למטופל - {client.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* בחירת תבנית */}
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
                💡 טיפ: השתמש ב-{"{שם}"} כדי להוסיף את שם המטופל
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
                disabled={!formData.subject || !formData.content}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                תצוגה מקדימה
              </Button>
              <Button type="submit" disabled={isSending} className="flex-1 gap-2">
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    שולח...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    שלח מייל
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

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>תצוגה מקדימה - כך המייל ייראה</DialogTitle>
            <DialogDescription>
              מוודא שהכל נראה טוב לפני השליחה
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-4 bg-slate-50 rounded-lg border">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">אל:</div>
              <div className="font-medium">{client.email}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">נושא:</div>
              <div className="font-bold text-lg">{replaceVariables(formData.subject)}</div>
            </div>
            <div className="border-t pt-4">
              <div className="text-sm text-muted-foreground mb-2">תוכן:</div>
              <div 
                className="bg-white p-4 rounded border whitespace-pre-wrap font-sans leading-relaxed"
                dir="rtl"
              >
                {replaceVariables(formData.content)}
              </div>
            </div>
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
              נראה מצוין, שלח!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}







