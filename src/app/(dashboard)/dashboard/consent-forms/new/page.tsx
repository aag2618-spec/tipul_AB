"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, ArrowRight } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { CONSENT_TYPE_LABELS, CONSENT_TEMPLATES } from "@/lib/consent-templates";
import type { ConsentType } from "@prisma/client";
import Link from "next/link";
import { toast } from "sonner";

interface ClientOption {
  id: string;
  name: string;
}

export default function NewConsentFormPage() {
  return (
    <Suspense>
      <NewConsentFormContent />
    </Suspense>
  );
}

function NewConsentFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId");

  const [type, setType] = useState<ConsentType | "">("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isTemplate, setIsTemplate] = useState(false);
  const [clientId, setClientId] = useState<string>(preselectedClientId || "");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    fetch("/api/clients?status=ACTIVE")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setClients(
          data.map((c: { id: string; firstName: string; lastName: string }) => ({
            id: c.id,
            name: `${c.firstName} ${c.lastName}`.trim(),
          }))
        );
      })
      .catch(() => setClients([]))
      .finally(() => setLoadingClients(false));
  }, []);

  const handleTypeChange = (value: string) => {
    const newType = value as ConsentType;
    setType(newType);

    const template = CONSENT_TEMPLATES[newType];
    if (template) {
      setTitle(template.title);
      if (!content || content === "<p></p>") {
        setContent(template.content);
      }
    } else {
      setTitle(CONSENT_TYPE_LABELS[newType] || "");
    }
  };

  const handleLoadTemplate = () => {
    if (!type) return;
    const template = CONSENT_TEMPLATES[type as ConsentType];
    if (template) {
      setContent(template.content);
      setTitle(template.title);
      toast.success("התבנית נטענה");
    }
  };

  const handleSubmit = async () => {
    if (!type || !title.trim() || !content.trim()) {
      toast.error("יש למלא סוג, כותרת ותוכן");
      return;
    }

    setIsLoading(true);
    try {
      const body: Record<string, unknown> = {
        type,
        title: title.trim(),
        content,
        isTemplate,
      };
      if (!isTemplate && clientId && clientId !== "none") {
        body.clientId = clientId;
      }

      const res = await fetch("/api/consent-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה ביצירת הטופס");
      }

      const created = await res.json();
      toast.success("הטופס נוצר בהצלחה");
      router.push(`/dashboard/consent-forms/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה ביצירת הטופס");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">טופס הסכמה חדש</h1>
          <p className="text-muted-foreground">צור טופס הסכמה חדש או תבנית לשימוש חוזר</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/consent-forms">
            <ArrowRight className="ml-2 h-4 w-4" />
            חזרה לרשימה
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטי הטופס</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Type selector */}
          <div className="space-y-2">
            <Label>סוג הטופס</Label>
            <Select value={type} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="בחר סוג טופס" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(CONSENT_TYPE_LABELS) as [ConsentType, string][]).map(
                  ([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>כותרת</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת הטופס"
              maxLength={200}
            />
          </div>

          {/* Client selector (hidden when template) */}
          {!isTemplate && (
            <div className="space-y-2">
              <Label>מטופל/ת (אופציונלי)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingClients ? "טוען..." : "בחר מטופל/ת"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ללא מטופל/ת</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Template toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={isTemplate}
              onCheckedChange={(checked) => {
                setIsTemplate(checked);
                if (checked) setClientId("");
              }}
            />
            <Label>שמור כתבנית לשימוש חוזר</Label>
          </div>

          {/* Load template button */}
          {type && CONSENT_TEMPLATES[type as ConsentType] && (
            <Button variant="outline" type="button" onClick={handleLoadTemplate}>
              טען תבנית ברירת מחדל
            </Button>
          )}

          {/* Rich text editor */}
          <div className="space-y-2">
            <Label>תוכן הטופס</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="כתוב את תוכן הטופס כאן..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={isLoading || !type || !title.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <Save className="ml-2 h-4 w-4" />
                  שמור טופס
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
