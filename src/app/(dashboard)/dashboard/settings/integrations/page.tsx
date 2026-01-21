'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Mail, Link as LinkIcon, Unlink, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function IntegrationsPage() {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    checkGoogleConnection();
  }, []);

  const checkGoogleConnection = async () => {
    try {
      const res = await fetch('/api/user/google-calendar');
      if (res.ok) {
        const data = await res.json();
        setGoogleConnected(data.connected);
        setGoogleEmail(data.email);
      }
    } catch (error) {
      console.error('Error checking Google connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectGoogle = async () => {
    // Use NextAuth to sign in with Google (will request calendar permissions)
    await signIn('google', { callbackUrl: '/dashboard/settings/integrations' });
  };

  const disconnectGoogle = async () => {
    if (!confirm('האם אתה בטוח שברצונך לנתק את החיבור ל-Google?')) return;
    
    setDisconnecting(true);
    try {
      const res = await fetch('/api/user/google-calendar', { method: 'DELETE' });
      if (res.ok) {
        setGoogleConnected(false);
        setGoogleEmail(null);
        toast.success('החיבור ל-Google נותק בהצלחה');
      } else {
        toast.error('שגיאה בניתוק החיבור');
      }
    } catch (error) {
      console.error('Error disconnecting Google:', error);
      toast.error('שגיאה בניתוק החיבור');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">אינטגרציות</h1>
        <p className="text-muted-foreground">
          חיבור שירותים חיצוניים למערכת
        </p>
      </div>

      {/* Navigation */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings">
            פרופיל
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/notifications">
            התראות
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/communication">
            תקשורת
          </Link>
        </Button>
        <Button variant="default" size="sm" className="gap-2">
          <LinkIcon className="h-4 w-4" />
          אינטגרציות
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Google Calendar Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Google Calendar
                    {googleConnected ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 ml-1" />
                        מחובר
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="h-3 w-3 ml-1" />
                        לא מחובר
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    סנכרון פגישות עם יומן Google שלך
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {googleConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">מחובר כ: <strong>{googleEmail}</strong></span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>✅ פגישות חדשות יתווספו אוטומטית ליומן Google שלך</p>
                  <p>✅ שינויים וביטולים יתעדכנו אוטומטית</p>
                  <p>✅ המטופלים יקבלו הזמנה ליומן שלהם</p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={disconnectGoogle}
                  disabled={disconnecting}
                >
                  <Unlink className="h-4 w-4" />
                  {disconnecting ? 'מנתק...' : 'נתק חיבור'}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p>חיבור ל-Google Calendar יאפשר לך:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>סנכרון אוטומטי של כל הפגישות שלך</li>
                    <li>שליחת הזמנות יומן למטופלים</li>
                    <li>עדכון אוטומטי בעת שינוי או ביטול</li>
                    <li>תזכורות דרך יומן Google</li>
                  </ul>
                </div>
                <Button onClick={connectGoogle} className="gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  התחבר עם Google
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Integration Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <Mail className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  שליחת מיילים
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 ml-1" />
                    מוגדר
                  </Badge>
                </CardTitle>
                <CardDescription>
                  מיילים אוטומטיים למטופלים
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              <p>המערכת שולחת מיילים אוטומטיים עבור:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>אישור קביעת תור</li>
                <li>תזכורות לפני פגישות (24 שעות / 2 שעות)</li>
                <li>בקשות ביטול ועדכונים</li>
              </ul>
              <p className="mt-3">
                <Link href="/dashboard/settings/communication" className="text-primary hover:underline">
                  ניהול הגדרות מיילים →
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
