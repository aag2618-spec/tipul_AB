"use client";

import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, X, Lock, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  THERAPEUTIC_APPROACHES,
  APPROACH_CATEGORIES,
  type TherapeuticApproach,
} from "@/lib/therapeutic-approaches";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";

interface ApproachSelectorProps {
  value: string[]; // Selected approach IDs
  onChange: (approaches: string[]) => void;
  placeholder?: string;
  maxHeight?: string;
  disabled?: boolean; // For PRO tier - show but don't allow selection
}

export function ApproachSelector({
  value = [],
  onChange,
  placeholder = "חפש גישה או תאורטיקן...",
  maxHeight = "400px",
  disabled = false,
}: ApproachSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    "psychodynamic",
    "cbt",
  ]);

  // Filter approaches by search query
  const filteredApproaches = useMemo(() => {
    if (!searchQuery.trim()) return THERAPEUTIC_APPROACHES;

    const query = searchQuery.toLowerCase();
    return THERAPEUTIC_APPROACHES.filter(
      (a) =>
        a.nameHe.toLowerCase().includes(query) ||
        a.nameEn.toLowerCase().includes(query) ||
        a.descriptionHe.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group approaches by category
  const groupedApproaches = useMemo(() => {
    const groups: Record<string, TherapeuticApproach[]> = {};
    
    APPROACH_CATEGORIES.forEach((cat) => {
      groups[cat.id] = filteredApproaches.filter((a) => a.category === cat.id);
    });
    
    return groups;
  }, [filteredApproaches]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const toggleApproach = (approachId: string) => {
    if (disabled) {
      setShowUpgradeDialog(true);
      return;
    }
    onChange(
      value.includes(approachId)
        ? value.filter((id) => id !== approachId)
        : [...value, approachId]
    );
  };

  const removeApproach = (approachId: string) => {
    onChange(value.filter((id) => id !== approachId));
  };

  const clearAll = () => {
    onChange([]);
  };

  // Get selected approaches objects
  const selectedApproaches = value
    .map((id) => THERAPEUTIC_APPROACHES.find((a) => a.id === id))
    .filter((a): a is TherapeuticApproach => a !== undefined);

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Selected Approaches (Tags) */}
      {selectedApproaches.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 flex-wrap w-full">
            <span className="text-sm font-medium">נבחרו ({selectedApproaches.length}):</span>
            {selectedApproaches.map((approach) => (
              <Badge
                key={approach.id}
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-destructive/20"
                onClick={() => removeApproach(approach.id)}
              >
                {approach.nameHe}
                <X className="h-3 w-3" />
              </Badge>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-6 text-xs"
            >
              נקה הכל
            </Button>
          </div>
        </div>
      )}

      {/* Categories with Approaches */}
      <div
        className="border rounded-lg overflow-auto"
        style={{ maxHeight }}
      >
        {APPROACH_CATEGORIES.map((category) => {
          const categoryApproaches = groupedApproaches[category.id] || [];
          if (categoryApproaches.length === 0) return null;

          const isExpanded = expandedCategories.includes(category.id);
          const selectedInCategory = categoryApproaches.filter((a) =>
            value.includes(a.id)
          ).length;

          return (
            <div key={category.id} className="border-b last:border-b-0">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="text-right">
                    <div className="font-semibold">{category.nameHe}</div>
                    <div className="text-xs text-muted-foreground">
                      {category.nameEn}
                    </div>
                  </div>
                </div>
                <Badge variant="outline">
                  {selectedInCategory}/{categoryApproaches.length}
                </Badge>
              </button>

              {/* Category Approaches */}
              {isExpanded && (
                <div className="bg-muted/30">
                  {categoryApproaches.map((approach) => {
                    const isSelected = value.includes(approach.id);

                    return (
                      <div
                        key={approach.id}
                        className="px-4 py-3 border-t hover:bg-background/80 transition-colors cursor-pointer"
                        onClick={() => toggleApproach(approach.id)}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleApproach(approach.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 text-right">
                            <div className="font-medium">{approach.nameHe}</div>
                            <div className="text-xs text-muted-foreground">
                              {approach.nameEn}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {approach.descriptionHe}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {searchQuery && filteredApproaches.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>לא נמצאו תוצאות עבור "{searchQuery}"</p>
          <p className="text-xs mt-2">נסה לחפש בעברית או אנגלית</p>
        </div>
      )}

      {!searchQuery && filteredApproaches.length > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          {filteredApproaches.length} גישות וכיוונים זמינים
          {disabled && " • שדרג לארגוני לבחירת גישות"}
        </div>
      )}

      {/* Upgrade Dialog for PRO users */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-6 w-6 text-amber-500" />
              שדרג לתוכנית ארגוני
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              רוצה שה-AI ינתח לפי הגישה הטיפולית שלך?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200">
              <p className="font-semibold text-amber-900 mb-2">🧠 בתוכנית ארגוני תוכל:</p>
              <ul className="space-y-2 text-sm text-amber-800">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  לבחור גישות כמו CBT, פסיכודינמית, בולבי, מאהלר ועוד
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  לקבל ניתוחים מותאמים עם מושגים מהגישה שבחרת
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  להגדיר גישות שונות למטופלים שונים
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  ניתוח מפורט ודוחות התקדמות AI
                </li>
              </ul>
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowUpgradeDialog(false)}
              >
                אולי אחר כך
              </Button>
              <Button
                asChild
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                <Link href="/dashboard/settings/ai-assistant">
                  שדרג עכשיו ⬆️
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
