"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2, Repeat, Settings, Waves } from "lucide-react";
import { format } from "date-fns";

interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  defaultSessionPrice?: number | null;
  creditBalance?: number | null;
}

interface CalendarEventDialogProps {
  isDialogOpen: boolean;
  setIsDialogOpen: (open: boolean) => void;
  selectedDate: Date | null;
  formData: {
    clientId: string;
    startTime: string;
    endTime: string;
    type: string;
    price: string;
    isRecurring: boolean;
    weeksToRepeat: number;
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    clientId: string;
    startTime: string;
    endTime: string;
    type: string;
    price: string;
    isRecurring: boolean;
    weeksToRepeat: number;
  }>>;
  clients: Client[];
  isSubmitting: boolean;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  defaultSessionDuration: number;
  showDurationCustomizer: boolean;
  setShowDurationCustomizer: (show: boolean) => void;
  customDuration: number;
  handleDurationChange: (minutes: number) => void;
}

export function CalendarEventDialog({
  isDialogOpen,
  setIsDialogOpen,
  selectedDate,
  formData,
  setFormData,
  clients,
  isSubmitting,
  handleSubmit,
  defaultSessionDuration,
  showDurationCustomizer,
  setShowDurationCustomizer,
  customDuration,
  handleDurationChange,
}: CalendarEventDialogProps) {
  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>פגישה חדשה</DialogTitle>
          <DialogDescription>
            {selectedDate && format(selectedDate, "EEEE, d בMMMM yyyy")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formData.type !== "BREAK" && (
            <div className="space-y-2">
              <Label htmlFor="clientId">מטופל</Label>
              <Select
                value={formData.clientId}
                onValueChange={(value) => {
                  const selectedClient = clients.find((c) => c.id === value);
                  setFormData((prev) => ({
                    ...prev,
                    clientId: value,
                    price: selectedClient?.defaultSessionPrice
                      ? String(selectedClient.defaultSessionPrice)
                      : prev.price,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר מטופל" />
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
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">שעת התחלה</Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => {
                  const startValue = e.target.value;
                  if (startValue) {
                    const start = new Date(startValue);
                    const end = new Date(start);
                    end.setMinutes(end.getMinutes() + defaultSessionDuration);
                    setFormData((prev) => ({
                      ...prev,
                      startTime: startValue,
                      endTime: format(end, "yyyy-MM-dd'T'HH:mm")
                    }));
                  } else {
                    setFormData((prev) => ({ ...prev, startTime: startValue }));
                  }
                }}
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime">שעת סיום</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, endTime: e.target.value }))
                }
                dir="ltr"
              />
            </div>
          </div>

          {/* Duration Customizer */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowDurationCustomizer(!showDurationCustomizer)}
              className="w-full text-sm text-muted-foreground hover:text-primary"
            >
              <Settings className="h-4 w-4 ml-2" />
              התאם משך פגישה
            </Button>

            {showDurationCustomizer && (
              <div className="border rounded-lg p-3 bg-slate-50 space-y-3 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="customDuration" className="text-sm whitespace-nowrap">
                    משך (דקות):
                  </Label>
                  <Input
                    id="customDuration"
                    type="number"
                    min="5"
                    max="180"
                    value={customDuration}
                    onChange={(e) => handleDurationChange(parseInt(e.target.value) || defaultSessionDuration)}
                    className="w-20 bg-white"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[15, 30, 45, 60].map((minutes) => (
                    <Button
                      key={minutes}
                      type="button"
                      variant={customDuration === minutes ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleDurationChange(minutes)}
                      className="text-xs"
                    >
                      {minutes} דק׳
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">סוג פגישה</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BREAK">
                    <div className="flex items-center gap-2">
                      <Waves className="h-4 w-4" />
                      הפסקה
                    </div>
                  </SelectItem>
                  <SelectItem value="IN_PERSON">פרונטלי</SelectItem>
                  <SelectItem value="ONLINE">אונליין</SelectItem>
                  <SelectItem value="PHONE">טלפון</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">מחיר (₪)</Label>
              <Input
                id="price"
                type="number"
                placeholder="0"
                value={formData.price}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, price: e.target.value }))
                }
                dir="ltr"
              />
            </div>
          </div>

          {/* Recurring Options */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Repeat className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">פגישה חוזרת</p>
                <p className="text-sm text-muted-foreground">
                  שכפל את הפגישה לשבועות הבאים
                </p>
              </div>
            </div>
            <Switch
              checked={formData.isRecurring}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isRecurring: checked }))
              }
            />
          </div>

          {formData.isRecurring && (
            <div className="space-y-2">
              <Label>כמה שבועות?</Label>
              <Select
                value={formData.weeksToRepeat.toString()}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, weeksToRepeat: parseInt(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 4, 8, 12, 16].map((weeks) => (
                    <SelectItem key={weeks} value={weeks.toString()}>
                      {weeks} שבועות
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  יוצר...
                </>
              ) : (
                "צור פגישה"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
