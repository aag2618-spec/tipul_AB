"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  name?: string | null;
  email: string | null;
}

export default function SendEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [formData, setFormData] = useState({
    subject: "",
    content: "",
  });

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
            <CardTitle>כתוב הודעה</CardTitle>
            <CardDescription>המייל ישלח ישירות למטופל</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                rows={10}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={isSending} className="flex-1">
                {isSending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    שולח...
                  </>
                ) : (
                  <>
                    <Send className="ml-2 h-4 w-4" />
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
    </div>
  );
}







