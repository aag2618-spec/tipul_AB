"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Save, Brain, Sparkles, Lock } from "lucide-react";
import Link from "next/link";

const THERAPEUTIC_APPROACHES = [
  { value: 'CBT', label: 'CBT - קוגניטיבית התנהגותית', description: 'מחשבות, רגשות והתנהגויות' },
  { value: 'Psychodynamic', label: 'פסיכודינמית / פסיכואנליטית', description: 'תהליכים לא מודעים ודפוסים' },
  { value: 'ACT', label: 'ACT - Acceptance & Commitment', description: 'ערכים, קבלה ומיינדפולנס' },
  { value: 'DBT', label: 'DBT - דיאלקטית התנהגותית', description: 'רגולציה רגשית ומיומנויות' },
  { value: 'Solution-Focused', label: 'ממוקדת פתרונות', description: 'חוזקות ופתרונות' },
  { value: 'Humanistic', label: 'הומניסטית (רוג\'רס)', description: 'קבלה ללא תנאי ואמפתיה' },
  { value: 'Systemic', label: 'מערכתית / משפחתית', description: 'דינמיקות ומערכות יחסים' },
  { value: 'EMDR', label: 'EMDR', description: 'עיבוד טראומות' },
  { value: 'Mindfulness', label: 'מיינדפולנס / מבוססת-מודעות', description: 'קבלה ונוכחות' },
  { value: 'Gestalt', label: 'גשטלט', description: 'כאן ועכשיו, מודעות' },
  { value: 'Existential', label: 'אקזיסטנציאלית', description: 'משמעות, חירות, אחריות' },
  { value: 'Coaching', label: 'קוצ\'ינג / NLP', description: 'מטרות ותוצאות' },
  { value: 'Eclectic', label: 'אקלקטית / אינטגרטיבית', description: 'שילוב גישות' },
];

export default function AIAssistantSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userTier, setUserTier] = useState<'ESSENTIAL' | 'PRO' | 'ENTERPRISE'>('ESSENTIAL');
  const [selectedApproaches, setSelectedApproaches] = useState<string[]>([]);
  const [approachDescription, setApproachDescription] = useState('');
  const [analysisStyle, setAnalysisStyle] = useState('professional');
  const [tone, setTone] = useState('formal');
  const [customInstructions, setCustomInstructions] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/user/ai-settings');
      if (response.ok) {
        const data = await response.json();
        setUserTier(data.aiTier);
        setSelectedApproaches(data.therapeuticApproaches || []);
        setApproachDescription(data.approachDescription || '');
        setAnalysisStyle(data.analysisStyle || 'professional');
        setTone(data.aiTone || 'formal');
        setCustomInstructions(data.customAIInstructions || '');
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/user/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapeuticApproaches: selectedApproaches,
          approachDescription,
          analysisStyle,
          aiTone: tone,
          customAIInstructions: customInstructions,
        }),
      });

      if (response.ok) {
        toast.success('ההגדרות נשמרו בהצלחה! ✨');
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast.error('שגיאה בשמירת ההגדרות');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleApproach = (approach: string) => {
    if (selectedApproaches.includes(approach)) {
      setSelectedApproaches(selectedApproaches.filter(a => a !== approach));
    } else {
      setSelectedApproaches([...selectedApproaches, approach]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (userTier === 'ESSENTIAL') {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold">🤖 AI Therapy Assistant</h1>
          <p className="text-muted-foreground mt-1">
            הכנה חכמה ומקצועית לכל פגישה
          </p>
        </div>

        <Card className="border-2 border-primary bg-gradient-to-br from-blue-50 to-purple-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-6 w-6 text-primary" />
              <CardTitle>AI Assistant - Premium Feature</CardTitle>
            </div>
            <CardDescription>זמין בתוכניות Professional ו-Enterprise</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm">
                AI Therapy Assistant מספק לך ניתוח מעמיק והכנה מקצועית לכל פגישה:
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary mt-1" />
                  <span className="text-sm">ניתוח אוטומטי של דפוסים ונושאים חוזרים</span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary mt-1" />
                  <span className="text-sm">המלצות מבוססות על הגישה הטיפולית שלך (CBT, פסיכודינמית, ועוד)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary mt-1" />
                  <span className="text-sm">תובנות ושאלות מוצעות לכל פגישה</span>
                </div>
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary mt-1" />
                  <span className="text-sm">ניתוח חכם של שאלונים ואבחונים</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 pt-4">
                <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50/50">
                  <h3 className="font-semibold mb-2">🥈 Professional</h3>
                  <p className="text-2xl font-bold mb-1">120₪/חודש</p>
                  <p className="text-sm text-muted-foreground mb-3">GPT-4o-mini - איכות מצוינת</p>
                  <ul className="text-xs space-y-1 mb-3">
                    <li>✅ Session Prep יומי</li>
                    <li>✅ ניתוח מתקדם</li>
                    <li>✅ כל הגישות הטיפוליות</li>
                  </ul>
                </div>

                <div className="p-4 border-2 border-purple-200 rounded-lg bg-purple-50/50">
                  <h3 className="font-semibold mb-2">🥇 Enterprise</h3>
                  <p className="text-2xl font-bold mb-1">150₪/חודש</p>
                  <p className="text-sm text-muted-foreground mb-3">GPT-4o - הטוב ביותר!</p>
                  <ul className="text-xs space-y-1 mb-3">
                    <li>✅ ניתוח עמוק ביותר</li>
                    <li>✅ Deep Analysis שבועי</li>
                    <li>✅ תחזיות ודוחות</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button className="w-full" size="lg" asChild>
              <Link href="/dashboard/settings/billing">
                ⬆️ שדרג עכשיו
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">🤖 AI Therapy Assistant</h1>
          <p className="text-muted-foreground mt-1">
            התאם את ה-AI לסגנון העבודה שלך
          </p>
        </div>
        <Badge variant={userTier === 'ENTERPRISE' ? 'default' : 'secondary'} className="text-sm">
          {userTier === 'ENTERPRISE' ? '🥇 Enterprise' : '🥈 Professional'}
        </Badge>
      </div>

      {/* Current Plan Info */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            <div>
              <p className="font-semibold">
                {userTier === 'ENTERPRISE' ? 'GPT-4o Premium' : 'GPT-4o-mini Pro'}
              </p>
              <p className="text-sm text-muted-foreground">
                {userTier === 'ENTERPRISE' 
                  ? 'המודל החכם והמתקדם ביותר - ניתוח עמוק ביותר'
                  : 'מודל מתקדם ויעיל - איכות מצוינת במחיר משתלם'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Therapeutic Approaches */}
      <Card>
        <CardHeader>
          <CardTitle>🧠 הגישות הטיפוליות שלך</CardTitle>
          <CardDescription>בחר אחת או יותר גישות שבהן אתה עובד</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {THERAPEUTIC_APPROACHES.map((approach) => (
              <div
                key={approach.value}
                className={`p-3 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                  selectedApproaches.includes(approach.value)
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background'
                }`}
                onClick={() => toggleApproach(approach.value)}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedApproaches.includes(approach.value)}
                    onCheckedChange={() => toggleApproach(approach.value)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{approach.label}</p>
                    <p className="text-xs text-muted-foreground">{approach.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedApproaches.length > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-900">
                נבחרו {selectedApproaches.length} גישות
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Description */}
      {selectedApproaches.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>✍️ תאר את הגישה האקלקטית שלך</CardTitle>
            <CardDescription>
              כיצד אתה משלב בין הגישות השונות? (אופציונלי)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="דוגמה: אני משלב CBT לעבודה על מחשבות אוטומטיות, פסיכודינמית להבנת דפוסים עמוקים מהעבר, ומיינדפולנס לרגולציה רגשית. עם זוגות אני משתמש בגישה מערכתית."
              value={approachDescription}
              onChange={(e) => setApproachDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </CardContent>
        </Card>
      )}

      {/* Analysis Style */}
      <Card>
        <CardHeader>
          <CardTitle>📝 סגנון הניתוח</CardTitle>
          <CardDescription>איך תרצה שה-AI יכתוב את הניתוחים?</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={analysisStyle} onValueChange={setAnalysisStyle}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="professional">מקצועי ומעמיק</SelectItem>
              <SelectItem value="practical">פרקטי ומוכוון פעולה</SelectItem>
              <SelectItem value="emotional">ממוקד רגש ותובנות</SelectItem>
              <SelectItem value="concise">קצר וישיר לעניין</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Tone */}
      <Card>
        <CardHeader>
          <CardTitle>🎨 טון השפה</CardTitle>
          <CardDescription>איזה טון תרצה בניתוחים?</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="formal">פורמלי ומקצועי</SelectItem>
              <SelectItem value="warm">חם ואמפתי</SelectItem>
              <SelectItem value="direct">ישיר ועניני</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Custom Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ הוראות מותאמות אישית</CardTitle>
          <CardDescription>
            הוראות ספציפיות נוספות ל-AI (אופציונלי)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="דוגמה: שים דגש על עבודה עם חלומות, הימנע ממינוחים טכניים מדי, תמיד התייחס לדפוסי התקשרות"
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </CardContent>
      </Card>

      {/* What AI Will Do */}
      <Card className="bg-gradient-to-br from-green-50 to-blue-50 border-green-200">
        <CardHeader>
          <CardTitle>🎯 מה ה-AI יעשה?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <span>
                <strong>Session Prep יומי:</strong> לפני כל פגישה, ה-AI ינתח את הסיכומים האחרונים ויכין briefing מותאם
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <span>
                <strong>ניתוח לפי הגישה שלך:</strong> הניתוח יהיה מותאם לגישות הטיפוליות שבחרת
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <span>
                <strong>תובנות והמלצות:</strong> זיהוי דפוסים, המלצות להתערבויות, ושאלות מוצעות
              </span>
            </li>
            {userTier === 'ENTERPRISE' && (
              <li className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <span>
                  <strong>Deep Analysis שבועי:</strong> ניתוח מעמיק של כל המטופלים שלך
                </span>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={fetchSettings}>
          ביטול
        </Button>
        <Button onClick={handleSave} disabled={isSaving || selectedApproaches.length === 0}>
          {isSaving ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              שומר...
            </>
          ) : (
            <>
              <Save className="ml-2 h-4 w-4" />
              שמור הגדרות
            </>
          )}
        </Button>
      </div>

      {selectedApproaches.length === 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="pt-6">
            <p className="text-sm text-yellow-900">
              יש לבחור לפחות גישה טיפולית אחת כדי להשתמש ב-AI Assistant
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
