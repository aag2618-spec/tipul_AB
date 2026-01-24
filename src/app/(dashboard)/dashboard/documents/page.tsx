import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Plus, FileText, CheckCircle, Clock, User, Download } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

async function getDocuments(userId: string) {
  return prisma.document.findMany({
    where: { therapistId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true } },
    },
  });
}

export default async function DocumentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const documents = await getDocuments(session.user.id);
  
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "CONSENT_FORM": return "טופס הסכמה";
      case "INTAKE_FORM": return "טופס קבלה";
      case "TREATMENT_PLAN": return "תוכנית טיפול";
      case "REPORT": return "דוח";
      default: return "אחר";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מסמכים</h1>
          <p className="text-muted-foreground">
            {documents.length} מסמכים במערכת
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/documents/upload">
            <Plus className="ml-2 h-4 w-4" />
            העלה מסמך
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{documents.length}</p>
              <p className="text-sm text-muted-foreground">סה״כ מסמכים במערכת</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      {documents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>כל המסמכים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-background"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{doc.name}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <Badge variant="outline">{getTypeLabel(doc.type)}</Badge>
                        {doc.client && (
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {doc.client.name}
                          </span>
                        )}
                        <span>{format(new Date(doc.createdAt), "dd/MM/yyyy")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 ml-2" />
                        פתח
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={doc.fileUrl} download target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="mb-2">אין מסמכים עדיין</CardTitle>
            <CardDescription className="mb-4">
              העלה מסמכים וטפסים לניהול
            </CardDescription>
            <Button asChild>
              <Link href="/dashboard/documents/upload">
                <Plus className="ml-2 h-4 w-4" />
                העלה מסמך ראשון
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}













