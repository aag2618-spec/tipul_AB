"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Loader2, RefreshCw, Sparkles, Lock } from "lucide-react";
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

// תרגום שמות תוכניות
const TIER_NAMES: Record<string, { he: string; en: string }> = {
  ESSENTIAL: { he: 'בסיסי', en: 'Essential' },
  PRO: { he: 'מקצועי', en: 'Professional' },
  ENTERPRISE: { he: 'ארגוני', en: 'Enterprise' }
};

export function SessionPrepCard({ session, userTier }: SessionPrepCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [prep, setPrep] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleGenerate = async () => {
    if (userTier === 'ESSENTIAL') {
      toast.error('הכנה לפגישה זמינה רק בתוכניות מקצועי וארגוני');
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
        throw new Error(error.message || 'שגיאה ביצירת הכנה לפגישה');
      }

      const data = await response.json();
      
      if (!data.content) {
        toast.info(data.message || 'אין מספיק נתונים ליצירת הכנה');
        return;
      }

      setPrep(data);
      setIsExpanded(true);
      toast.success('ההכנה לפגישה נוצרה בהצלחה!');
    } catch (error: any) {
      console.error('שגיאה בהכנה לפגישה:', error);
      toast.error(error.message || 'שגיאה ביצירת הכנה לפגישה');
    } finally {
      setIsLoading(false);
    }
  };

  // תוכנית בסיסית - הצגת אפשרות שדרוג
  if (userTier === 'ESSENTIAL') {
    return (
      <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-blue-50/50 to-purple-50/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">🤖 הכנה לפגישה</CardTitle>
            <Badge variant="outline" className="mr-auto">
              <Lock className="h-3 w-3 ml-1" />
              תכונה מתקדמת
            </Badge>
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
                ⬆️ שדרג לתוכנית מקצועית
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // קבלת שם התוכנית לתצוגה
  const tierDisplay = userTier === 'ENTERPRISE' 
    ? 'ארגוני - מפורט' 
    : 'מקצועי - תמציתי';

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-blue-50/30 to-purple-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">🤖 הכנה לפגישה</CardTitle>
            <Badge variant="secondary">{tierDisplay}</Badge>
          </div>
          {prep && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleGenerate}
              disabled={isLoading}
              title="יצירה מחדש"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription>{session.clientName}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* מצב ראשוני - לפני יצירה */}
        {!prep && !isLoading && (
          <div className="text-center py-6">
            <Brain className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-4">
              לחץ לקבלת ניתוח והכנה חכמה לפגישה
            </p>
            <Button onClick={handleGenerate} disabled={isLoading}>
              <Sparkles className="h-4 w-4 ml-2" />
              צור הכנה לפגישה
            </Button>
          </div>
        )}

        {/* מצב טעינה */}
        {isLoading && (
          <div className="text-center py-6">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              מנתח את הפגישות האחרונות...
            </p>
          </div>
        )}

        {/* תוצאת ההכנה */}
        {prep && (
          <div className="space-y-4">
            <div 
              className={`prose prose-sm max-w-none ${!isExpanded ? 'line-clamp-6' : ''}`}
              style={{ direction: 'rtl', textAlign: 'right' }}
            >
              <div className="whitespace-pre-wrap">{prep.content}</div>
            </div>
            
            {/* כפתור הרחבה */}
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
            
            {/* כפתור כיווץ */}
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

            {/* פרטי שימוש */}
            <div className="flex items-center justify-between pt-3 border-t text-xs text-muted-foreground">
              <span>🧠 {prep.tokensUsed?.toLocaleString() || 0} טוקנים</span>
              <span>💰 {(prep.cost || 0).toFixed(4)}₪</span>
              <span>⚡ Gemini 2.0</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
