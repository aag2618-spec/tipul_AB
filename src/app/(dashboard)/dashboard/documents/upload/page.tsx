"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";

interface Client {
  id: string;
  name: string;
}

function UploadDocumentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "OTHER",
    clientId: searchParams.get("client") || "",
  });

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch("/api/clients");
        if (response.ok) {
          setClients(await response.json());
        }
      } catch (error) {
        console.error("Failed to fetch clients:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClients();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!formData.name) {
        setFormData({ ...formData, name: file.name.replace(/\.[^/.]+$/, "") });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile || !formData.name || !formData.type) {
      toast.error("נא למלא את כל השדות ולבחור קובץ");
      return;
    }

    setIsUploading(true);

    try {
      const uploadData = new FormData();
      uploadData.append("file", selectedFile);
      uploadData.append("name", formData.name);
      uploadData.append("type", formData.type);
      if (formData.clientId) {
        uploadData.append("clientId", formData.clientId);
      }

      const response = await fetch("/api/documents", {
        method: "POST",
        body: uploadData,
      });

      if (!response.ok) {
        throw new Error("שגיאה בהעלאה");
      }

      toast.success("המסמך הועלה בהצלחה");
      
      if (formData.clientId) {
        router.push(`/dashboard/clients/${formData.clientId}`);
      } else {
        router.push("/dashboard/documents");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("אירעה שגיאה בהעלאת המסמך");
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/documents">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">העלאת מסמך</h1>
          <p className="text-muted-foreground">העלה מסמך חדש למערכת</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>פרטי המסמך</CardTitle>
            <CardDescription>בחר קובץ ומלא את הפרטים</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>קובץ</Label>
              <div
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                  hover:border-primary/50 transition-colors
                  ${selectedFile ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
                `}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-12 w-12 text-primary" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-12 w-12 text-muted-foreground" />
                    <p className="font-medium">לחץ לבחירת קובץ</p>
                    <p className="text-sm text-muted-foreground">
                      PDF, Word, תמונות עד 10MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">שם המסמך</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="שם המסמך..."
                />
              </div>

              <div className="space-y-2">
                <Label>סוג מסמך</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONSENT_FORM">טופס הסכמה</SelectItem>
                    <SelectItem value="INTAKE_FORM">טופס קבלה</SelectItem>
                    <SelectItem value="TREATMENT_PLAN">תוכנית טיפול</SelectItem>
                    <SelectItem value="REPORT">דוח</SelectItem>
                    <SelectItem value="OTHER">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>קשר למטופל (אופציונלי)</Label>
              <Select
                value={formData.clientId}
                onValueChange={(v) => setFormData({ ...formData, clientId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="ללא מטופל" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">ללא מטופל</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={isUploading || !selectedFile} className="flex-1">
                {isUploading ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    מעלה...
                  </>
                ) : (
                  <>
                    <Upload className="ml-2 h-4 w-4" />
                    העלה מסמך
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

export default function UploadDocumentPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[50vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UploadDocumentContent />
    </Suspense>
  );
}






