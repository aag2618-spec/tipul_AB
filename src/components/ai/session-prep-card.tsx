"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface SessionPrepCardProps {
  session: {
    id: string;
    clientId: string;
    clientName: string;
    startTime: Date;
  };
  userTier: 'ESSENTIAL' | 'PRO' | 'ENTERPRISE';
}

export function SessionPrepCard({ session, userTier }: SessionPrepCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [prep, setPrep] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleGenerate = async () => {
    if (userTier === 'ESSENTIAL') {
      toast.error('Session Prep זמין רק בתוכניות Pro ו-Enterprise');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/session-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: session.clientId,
          sessionDate: session.startTime,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate prep');
      }

      const data = await response.json();
      
      if (!data.content) {
        toast.info(data.message || 'אין מספיק נתונים ליצירת briefing');
        return;
      }

      setPrep(data);
      setIsExpanded(true);
      toast.success('Session Prep נוצר בהצלחה! ✨');
    } catch (error: any) {
      console.error('Session prep error:', error);
      toast.error(error.message || 'שגיאה ביצירת Session Prep');
    } finally {
      setIsLoading(false);
    }
  };

  if (userTier === 'ESSENTIAL') {
    return (
      <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-blue-50/50 to-purple-50/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">🤖 AI Session Prep</CardTitle>
            <Badge variant="outline" className="mr-auto">Premium Feature</Badge>
          </div>
          <CardDescription>הכנה חכמה ומקצועית לכל פגישה</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              קבל ניתוח מעמיק של הפגישות הקודמות, תובנות חכמות, והמלצות מותאמות אישית לכל פגישה.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <span>ניתוח אוטומטי של דפוסים ונושאים חוזרים</span>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <span>המלצות מבוססות על הגישה הטיפולית שלך</span>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <span>שאלות והתערבויות מוצעות</span>
              </div>
            </div>
            <Button className="w-full" asChild>
              <a href="/dashboard/settings/billing">
                ⬆️ שדרג ל-Professional
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-blue-50/30 to-purple-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">🤖 AI Session Prep</CardTitle>
            <Badge variant="secondary">{userTier === 'ENTERPRISE' ? 'GPT-4o' : 'GPT-4o-mini'}</Badge>
          </div>
          {prep && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleGenerate}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription>{session.clientName}</CardDescription>
      </CardHeader>
      <CardContent>
        {!prep && !isLoading && (
          <div className="text-center py-6">
            <Brain className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-4">
              לחץ לקבלת ניתוח והכנה חכמה לפגישה
            </p>
            <Button onClick={handleGenerate} disabled={isLoading}>
              <Sparkles className="h-4 w-4 ml-2" />
              צור Session Prep
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-6">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {userTier === 'ENTERPRISE' ? 'GPT-4o מנתח...' : 'GPT-4o-mini מנתח...'}
            </p>
          </div>
        )}

        {prep && (
          <div className="space-y-4">
            <div 
              className={`prose prose-sm max-w-none ${!isExpanded ? 'line-clamp-6' : ''}`}
              style={{ direction: 'rtl', textAlign: 'right' }}
            >
              <div className="whitespace-pre-wrap">{prep.content}</div>
            </div>
            
            {!isExpanded && prep.content.length > 300 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsExpanded(true)}
                className="w-full"
              >
                הצג עוד...
              </Button>
            )}
            
            {isExpanded && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsExpanded(false)}
                className="w-full"
              >
                הצג פחות
              </Button>
            )}

            <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
              <span>🧠 {prep.tokensUsed.toLocaleString()} tokens</span>
              <span>💰 {prep.cost.toFixed(4)}₪</span>
              <span>⚡ {userTier === 'ENTERPRISE' ? 'GPT-4o' : 'GPT-4o-mini'}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
