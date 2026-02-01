'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Calendar, Clock, MapPin, Video, Phone, User, X, AlertCircle } from 'lucide-react';

interface SessionCardProps {
  session: {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    type: string;
    location?: string | null;
  };
  clientId: string;
  clientName: string;
  therapistName: string;
  minCancellationHours?: number;
  onCancellationRequested?: () => void;
}

export function SessionCancellationCard({
  session,
  clientId,
  clientName,
  therapistName,
  minCancellationHours = 24,
  onCancellationRequested,
}: SessionCardProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sessionDate = new Date(session.startTime);
  const hoursUntilSession = (sessionDate.getTime() - Date.now()) / (1000 * 60 * 60);
  const canRequestCancellation = 
    session.status === 'SCHEDULED' && hoursUntilSession >= minCancellationHours;
  const isPendingCancellation = session.status === 'PENDING_CANCELLATION';

  const getTypeIcon = () => {
    switch (session.type) {
      case 'ONLINE':
        return <Video className="h-4 w-4" />;
      case 'PHONE':
        return <Phone className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getTypeLabel = () => {
    switch (session.type) {
      case 'ONLINE':
        return 'אונליין';
      case 'PHONE':
        return 'טלפונית';
      default:
        return 'פרונטלית';
    }
  };

  const getStatusBadge = () => {
    switch (session.status) {
      case 'SCHEDULED':
        return <Badge variant="default">מתוכנן</Badge>;
      case 'PENDING_CANCELLATION':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800">ממתין לאישור ביטול</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">מבוטל</Badge>;
      case 'COMPLETED':
        return <Badge variant="outline">הושלם</Badge>;
      case 'NO_SHOW':
        return <Badge variant="destructive">אי הופעה</Badge>;
      default:
        return <Badge variant="outline">{session.status}</Badge>;
    }
  };

  const handleRequestCancellation = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/request-cancellation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim() || undefined,
          clientId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('בקשת הביטול נשלחה בהצלחה');
        setShowCancelDialog(false);
        setReason('');
        onCancellationRequested?.();
      } else {
        toast.error(data.message || 'שגיאה בשליחת בקשת הביטול');
      }
    } catch (error) {
      console.error('Error requesting cancellation:', error);
      toast.error('שגיאה בשליחת בקשת הביטול');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className={isPendingCancellation ? 'border-orange-300 bg-orange-50/50' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">
                {format(sessionDate, 'EEEE, dd בMMMM', { locale: he })}
              </CardTitle>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(sessionDate, 'HH:mm', { locale: he })} - {format(new Date(session.endTime), 'HH:mm', { locale: he })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {getTypeIcon()}
              <span>{getTypeLabel()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{therapistName}</span>
            </div>
            {session.location && session.type === 'IN_PERSON' && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{session.location}</span>
              </div>
            )}
          </div>

          {isPendingCancellation && (
            <div className="flex items-start gap-2 p-3 bg-orange-100 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800">בקשת הביטול שלך ממתינה לאישור</p>
                <p className="text-orange-700">המטפל/ת יעדכן אותך בהקדם</p>
              </div>
            </div>
          )}

          {session.status === 'SCHEDULED' && !canRequestCancellation && hoursUntilSession > 0 && (
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-muted-foreground">
                לא ניתן לבקש ביטול פחות מ-{minCancellationHours} שעות לפני התור.
                <br />
                ליצירת קשר דחוף, נא לפנות ישירות למטפל/ת.
              </p>
            </div>
          )}

          {canRequestCancellation && (
            <Button
              variant="outline"
              className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowCancelDialog(true)}
            >
              <X className="h-4 w-4" />
              בקש ביטול תור
            </Button>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>בקשת ביטול תור</AlertDialogTitle>
            <AlertDialogDescription>
              האם ברצונך לבקש ביטול של התור ב-
              {format(sessionDate, 'dd/MM/yyyy בשעה HH:mm', { locale: he })}?
              <br />
              <br />
              הבקשה תישלח ל{therapistName} לאישור. תקבל/י עדכון במייל.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="סיבת הביטול (אופציונלי אך מומלץ)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRequestCancellation}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? 'שולח בקשה...' : 'שלח בקשת ביטול'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
