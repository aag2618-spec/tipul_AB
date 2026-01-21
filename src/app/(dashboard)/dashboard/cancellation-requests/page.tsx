'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Check, X, Mail, Phone, Clock, AlertTriangle, Calendar, User } from 'lucide-react';

interface CancellationRequest {
  id: string;
  sessionId: string;
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  sessionDate: string;
  sessionEndTime: string;
  sessionType: string;
  sessionStatus: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  hoursUntilSession: number;
  isUrgent: boolean;
}

export default function CancellationRequestsPage() {
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('PENDING');
  const [selectedRequest, setSelectedRequest] = useState<CancellationRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async (status?: string) => {
    try {
      setLoading(true);
      const url = status 
        ? `/api/cancellation-requests?status=${status}`
        : '/api/cancellation-requests';
      const res = await fetch(url);
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
      toast.error('שגיאה בטעינת הבקשות');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests(activeTab === 'ALL' ? undefined : activeTab);
  }, [activeTab, fetchRequests]);

  const handleApprove = async () => {
    if (!selectedRequest) return;
    
    setProcessing(true);
    try {
      const res = await fetch(`/api/cancellation-requests/${selectedRequest.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('הביטול אושר והמטופל/ת קיבל/ה עדכון');
        fetchRequests(activeTab === 'ALL' ? undefined : activeTab);
      } else {
        toast.error(data.message || 'שגיאה באישור הביטול');
      }
    } catch (error) {
      console.error('Error approving:', error);
      toast.error('שגיאה באישור הביטול');
    } finally {
      setProcessing(false);
      setSelectedRequest(null);
      setActionType(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast.error('נא להזין סיבת דחייה');
      return;
    }
    
    setProcessing(true);
    try {
      const res = await fetch(`/api/cancellation-requests/${selectedRequest.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success('הבקשה נדחתה והמטופל/ת קיבל/ה עדכון');
        fetchRequests(activeTab === 'ALL' ? undefined : activeTab);
      } else {
        toast.error(data.message || 'שגיאה בדחיית הבקשה');
      }
    } catch (error) {
      console.error('Error rejecting:', error);
      toast.error('שגיאה בדחיית הבקשה');
    } finally {
      setProcessing(false);
      setSelectedRequest(null);
      setActionType(null);
      setRejectionReason('');
    }
  };

  const getSessionTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      IN_PERSON: 'פרונטלי',
      ONLINE: 'אונליין',
      PHONE: 'טלפוני',
    };
    return types[type] || type;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      PENDING: { label: 'ממתין לאישור', variant: 'default' },
      APPROVED: { label: 'אושר', variant: 'secondary' },
      REJECTED: { label: 'נדחה', variant: 'destructive' },
    };
    const config = statusConfig[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">בקשות ביטול</h1>
          <p className="text-muted-foreground">
            ניהול בקשות ביטול תורים מהמטופלים
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-lg px-4 py-2">
            {pendingCount} בקשות ממתינות
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="PENDING">
            ממתינים
            {pendingCount > 0 && (
              <Badge variant="destructive" className="mr-2">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="APPROVED">אושרו</TabsTrigger>
          <TabsTrigger value="REJECTED">נדחו</TabsTrigger>
          <TabsTrigger value="ALL">הכל</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">אין בקשות {activeTab === 'PENDING' ? 'ממתינות' : ''}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {requests.map((request) => (
                <Card 
                  key={request.id}
                  className={request.isUrgent && request.status === 'PENDING' ? 'border-r-4 border-r-red-500' : ''}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{request.clientName}</CardTitle>
                          <CardDescription>
                            נשלחה {format(new Date(request.requestedAt), 'dd/MM/yyyy בשעה HH:mm', { locale: he })}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {request.isUrgent && request.status === 'PENDING' && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            דחוף
                          </Badge>
                        )}
                        {getStatusBadge(request.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {format(new Date(request.sessionDate), 'EEEE, dd בMMMM yyyy', { locale: he })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {format(new Date(request.sessionDate), 'HH:mm', { locale: he })} - {format(new Date(request.sessionEndTime), 'HH:mm', { locale: he })}
                          </span>
                          <Badge variant="outline">{getSessionTypeLabel(request.sessionType)}</Badge>
                        </div>
                        {request.hoursUntilSession > 0 && request.status === 'PENDING' && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>בעוד {Math.round(request.hoursUntilSession)} שעות</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        {request.clientEmail && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <a href={`mailto:${request.clientEmail}`} className="text-primary hover:underline">
                              {request.clientEmail}
                            </a>
                          </div>
                        )}
                        {request.clientPhone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <a href={`tel:${request.clientPhone}`} className="text-primary hover:underline">
                              {request.clientPhone}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {request.reason && (
                      <div className="mt-4 p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-1">סיבת הביטול:</p>
                        <p className="text-sm text-muted-foreground">{request.reason}</p>
                      </div>
                    )}

                    {request.adminNotes && request.status !== 'PENDING' && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm font-medium mb-1">הערות:</p>
                        <p className="text-sm text-muted-foreground">{request.adminNotes}</p>
                      </div>
                    )}

                    {request.status === 'PENDING' && (
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="default"
                          className="gap-2"
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('approve');
                          }}
                        >
                          <Check className="h-4 w-4" />
                          אשר ביטול
                        </Button>
                        <Button
                          variant="destructive"
                          className="gap-2"
                          onClick={() => {
                            setSelectedRequest(request);
                            setActionType('reject');
                          }}
                        >
                          <X className="h-4 w-4" />
                          דחה בקשה
                        </Button>
                        {request.clientEmail && (
                          <Button variant="outline" asChild>
                            <a href={`mailto:${request.clientEmail}`}>
                              <Mail className="h-4 w-4 ml-2" />
                              צור קשר
                            </a>
                          </Button>
                        )}
                      </div>
                    )}

                    {request.reviewedAt && (
                      <div className="mt-4 text-xs text-muted-foreground">
                        טופל ב-{format(new Date(request.reviewedAt), 'dd/MM/yyyy בשעה HH:mm', { locale: he })}
                        {request.reviewedBy && ` על ידי ${request.reviewedBy}`}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <AlertDialog open={actionType === 'approve'} onOpenChange={() => setActionType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>אישור ביטול</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך לאשר את ביטול התור של {selectedRequest?.clientName}?
              <br />
              המטופל/ת יקבל/תקבל מייל עם אישור הביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={processing}>
              {processing ? 'מאשר...' : 'אשר ביטול'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={actionType === 'reject'} onOpenChange={() => {
        setActionType(null);
        setRejectionReason('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>דחיית בקשה</AlertDialogTitle>
            <AlertDialogDescription>
              נא להזין את הסיבה לדחיית בקשת הביטול של {selectedRequest?.clientName}.
              <br />
              הסיבה תישלח למטופל/ת במייל.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="סיבת הדחייה..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>ביטול</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReject} 
              disabled={processing || !rejectionReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? 'שולח...' : 'דחה בקשה'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
