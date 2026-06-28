"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface CommitmentFormData {
  commitmentNumber: string;
  form17Number: string;
  referringDoctor: string;
  referralDate: string;
  approvedSessions: string;
  copaymentAmount: string;
  startDate: string;
  endDate: string;
  notes: string;
}

export const EMPTY_COMMITMENT_FORM: CommitmentFormData = {
  commitmentNumber: "",
  form17Number: "",
  referringDoctor: "",
  referralDate: "",
  approvedSessions: "",
  copaymentAmount: "",
  startDate: "",
  endDate: "",
  notes: "",
};

/**
 * שדות הטופס של התחייבות קופ"ח — מקור אמת יחיד לכל המסכים שיוצרים/עורכים
 * התחייבות (תיק המטופל, דף ההתחייבויות, ודף הפירוט). מקבל formData ו-onChange
 * חיצוניים כדי שכל מסך ינהל את ה-state/השמירה שלו.
 */
export function CommitmentFormFields({
  formData,
  onChange,
}: {
  formData: CommitmentFormData;
  onChange: (data: CommitmentFormData) => void;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="commitmentNumber">מספר התחייבות</Label>
          <Input
            id="commitmentNumber"
            value={formData.commitmentNumber}
            onChange={(e) => onChange({ ...formData, commitmentNumber: e.target.value })}
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="form17Number">מספר טופס 17</Label>
          <Input
            id="form17Number"
            value={formData.form17Number}
            onChange={(e) => onChange({ ...formData, form17Number: e.target.value })}
            dir="ltr"
            className="text-left"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="referringDoctor">רופא מפנה</Label>
        <Input
          id="referringDoctor"
          value={formData.referringDoctor}
          onChange={(e) => onChange({ ...formData, referringDoctor: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="approvedSessions">טיפולים מאושרים</Label>
          <Input
            id="approvedSessions"
            type="number"
            min="1"
            value={formData.approvedSessions}
            onChange={(e) => onChange({ ...formData, approvedSessions: e.target.value })}
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="copaymentAmount">השתתפות עצמית (₪)</Label>
          <Input
            id="copaymentAmount"
            type="number"
            min="0"
            step="1"
            value={formData.copaymentAmount}
            onChange={(e) => onChange({ ...formData, copaymentAmount: e.target.value })}
            dir="ltr"
            className="text-left"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="referralDate">תאריך הפניה</Label>
          <Input
            id="referralDate"
            type="date"
            value={formData.referralDate}
            onChange={(e) => onChange({ ...formData, referralDate: e.target.value })}
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="startDate">תחילת תקופה</Label>
          <Input
            id="startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => onChange({ ...formData, startDate: e.target.value })}
            dir="ltr"
            className="text-left"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endDate">סוף תקופה</Label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => onChange({ ...formData, endDate: e.target.value })}
            dir="ltr"
            className="text-left"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="commitmentNotes">הערות</Label>
        <Textarea
          id="commitmentNotes"
          value={formData.notes}
          onChange={(e) => onChange({ ...formData, notes: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  );
}

/**
 * בונה את גוף הבקשה (body) לשמירת התחייבות מתוך formData. מקור אמת יחיד
 * להמרת מחרוזות הטופס לערכים שה-API מצפה להם (null/number).
 */
export function buildCommitmentBody(formData: CommitmentFormData): Record<string, unknown> {
  return {
    commitmentNumber: formData.commitmentNumber || null,
    form17Number: formData.form17Number || null,
    referringDoctor: formData.referringDoctor || null,
    referralDate: formData.referralDate || null,
    approvedSessions: formData.approvedSessions ? parseInt(formData.approvedSessions) : null,
    copaymentAmount: formData.copaymentAmount !== "" ? parseFloat(formData.copaymentAmount) : null,
    startDate: formData.startDate || null,
    endDate: formData.endDate || null,
    notes: formData.notes || null,
  };
}
