"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileText, 
  Brain, 
  Eye, 
  ClipboardList, 
  Plus,
  ChevronLeft,
  Activity,
  Search
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

interface QuestionnaireTemplate {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  category: string | null;
  testType?: string;
}

interface Client {
  id: string;
  name: string;
}

interface QuestionnaireResponse {
  id: string;
  status: string;
  totalScore: number | null;
  createdAt: string;
  completedAt: string | null;
  template: {
    code: string;
    name: string;
    category: string | null;
  };
  client: {
    id: string;
    name: string;
  };
}

const testTypeIcons: Record<string, any> = {
  SELF_REPORT: FileText,
  CLINICIAN_RATED: ClipboardList,
  PROJECTIVE: Eye,
  INTELLIGENCE: Brain,
  NEUROPSYCH: Activity,
  INTERVIEW: ClipboardList,
};

const testTypeLabels: Record<string, string> = {
  SELF_REPORT: "דיווח עצמי",
  CLINICIAN_RATED: "הערכה קלינית",
  PROJECTIVE: "מבחן השלכתי",
  INTELLIGENCE: "אינטליגנציה",
  NEUROPSYCH: "נוירופסיכולוגי",
  INTERVIEW: "ראיון מובנה",
};

const categoryColors: Record<string, string> = {
  "דיכאון": "bg-blue-100 text-blue-800",
  "חרדה": "bg-yellow-100 text-yellow-800",
  "טראומה": "bg-red-100 text-red-800",
  "השלכתי": "bg-purple-100 text-purple-800",
  "אינטליגנציה": "bg-green-100 text-green-800",
  "נוירופסיכולוגי": "bg-orange-100 text-orange-800",
};

export default function QuestionnairesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<QuestionnaireTemplate[]>([]);
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<QuestionnaireTemplate | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [templatesRes, responsesRes, clientsRes] = await Promise.all([
        fetch("/api/questionnaires"),
        fetch("/api/questionnaires/responses"),
        fetch("/api/clients"),
      ]);

      if (templatesRes.ok) {
        setTemplates(await templatesRes.json());
      }
      if (responsesRes.ok) {
        setResponses(await responsesRes.json());
      }
      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData.clients || clientsData || []);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const startQuestionnaire = async () => {
    if (!selectedTemplate || !selectedClient) return;
    
    setCreating(true);
    try {
      const res = await fetch("/api/questionnaires/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          clientId: selectedClient,
        }),
      });

      if (res.ok) {
        const response = await res.json();
        setIsDialogOpen(false);
        router.push(`/dashboard/questionnaires/${response.id}/fill`);
      }
    } catch (error) {
      console.error("Error creating questionnaire:", error);
    } finally {
      setCreating(false);
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.name.includes(searchTerm) ||
    t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.nameEn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.category?.includes(searchTerm)
  );

  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const category = template.category || "אחר";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, QuestionnaireTemplate[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">שאלונים ומבחנים</h1>
            <p className="text-muted-foreground">
              בחר שאלון או מבחן להעברה למטופל
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">שאלונים זמינים</TabsTrigger>
          <TabsTrigger value="responses">
            תשובות ({responses.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש שאלון..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
          </div>

          {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={categoryColors[category] || "bg-gray-100 text-gray-800"}>
                  {category}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  ({categoryTemplates.length} שאלונים)
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {categoryTemplates.map((template) => {
                  const Icon = testTypeIcons[template.testType || "SELF_REPORT"] || FileText;
                  
                  return (
                    <Card 
                      key={template.id} 
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setIsDialogOpen(true);
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {template.code}
                          </Badge>
                        </div>
                        <CardTitle className="text-lg mt-2">{template.name}</CardTitle>
                        {template.nameEn && (
                          <p className="text-xs text-muted-foreground">{template.nameEn}</p>
                        )}
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="line-clamp-2">
                          {template.description || "אין תיאור"}
                        </CardDescription>
                        <div className="mt-3">
                          <Badge variant="secondary" className="text-xs">
                            {testTypeLabels[template.testType || "SELF_REPORT"]}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="responses" className="space-y-4">
          {/* Search for responses */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חפש לפי שם מטופל או שאלון..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>

          {responses.filter(r => 
            !searchTerm || 
            r.client.name.includes(searchTerm) || 
            r.template.name.includes(searchTerm)
          ).length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">
                {searchTerm ? "לא נמצאו תוצאות" : "אין תשובות לשאלונים"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? "נסה מונח חיפוש אחר" : "התחל בהעברת שאלון למטופל"}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {responses.filter(r => 
                !searchTerm || 
                r.client.name.includes(searchTerm) || 
                r.template.name.includes(searchTerm)
              ).map((response) => (
                <Card 
                  key={response.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/dashboard/questionnaires/${response.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">{response.template.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {response.client.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {response.totalScore !== null && (
                          <Badge variant="outline">
                            ציון: {response.totalScore}
                          </Badge>
                        )}
                        <Badge 
                          variant={
                            response.status === "COMPLETED" ? "default" :
                            response.status === "ANALYZED" ? "secondary" :
                            "outline"
                          }
                        >
                          {response.status === "IN_PROGRESS" && "בתהליך"}
                          {response.status === "COMPLETED" && "הושלם"}
                          {response.status === "ANALYZED" && "נותח"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(response.createdAt).toLocaleDateString("he-IL")}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>התחל שאלון חדש</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">בחר מטופל</label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר מטופל..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTemplate?.description && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">{selectedTemplate.description}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              ביטול
            </Button>
            <Button 
              onClick={startQuestionnaire}
              disabled={!selectedClient || creating}
            >
              {creating ? "יוצר..." : "התחל שאלון"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
