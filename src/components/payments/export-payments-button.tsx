'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';

export function ExportPaymentsButton() {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('ALL');

  // הגדרת תאריכי ברירת מחדל
  const setQuickRange = (range: 'month' | 'quarter' | 'year') => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start: Date;

    switch (range) {
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), quarterMonth, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end);
  };

  const handleExport = async () => {
    if (!startDate || !endDate) {
      toast.error('נא לבחור תאריכים');
      return;
    }

    setExporting(true);

    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        status,
        format: 'csv',
      });

      const response = await fetch(`/api/payments/export?${params}`);
      
      if (!response.ok) {
        throw new Error('שגיאה בייצוא');
      }

      // הורדת הקובץ
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payments_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('הקובץ הורד בהצלחה');
      setOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('שגיאה בייצוא התשלומים');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          ייצוא לרו"ח
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ייצוא תשלומים לרו"ח</DialogTitle>
          <DialogDescription>
            בחר את התקופה וסוג התשלומים לייצוא לקובץ Excel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* בחירה מהירה */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuickRange('month')}
            >
              החודש
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuickRange('quarter')}
            >
              הרבעון
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuickRange('year')}
            >
              השנה
            </Button>
          </div>

          {/* תאריך התחלה */}
          <div className="grid gap-2">
            <Label htmlFor="startDate">מתאריך</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* תאריך סיום */}
          <div className="grid gap-2">
            <Label htmlFor="endDate">עד תאריך</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {/* סטטוס */}
          <div className="grid gap-2">
            <Label htmlFor="status">סטטוס תשלום</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">הכל</SelectItem>
                <SelectItem value="PAID">ששולמו בלבד</SelectItem>
                <SelectItem value="PENDING">ממתינים בלבד</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* מידע */}
          <div className="text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="font-medium text-blue-900 mb-1">הקובץ יכלול:</p>
            <ul className="text-blue-800 space-y-1">
              <li>• תאריך, שם מטופל, סכום, שיטת תשלום</li>
              <li>• מספרי קבלות וקישורים</li>
              <li>• סיכום סה"כ בסוף הקובץ</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button onClick={handleExport} disabled={exporting || !startDate || !endDate}>
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                מייצא...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 ml-2" />
                הורד קובץ
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
