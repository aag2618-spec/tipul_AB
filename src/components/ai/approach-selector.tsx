"use client";

import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  THERAPEUTIC_APPROACHES,
  APPROACH_CATEGORIES,
  type TherapeuticApproach,
} from "@/lib/therapeutic-approaches";

interface ApproachSelectorProps {
  value: string[]; // Selected approach IDs
  onChange: (approaches: string[]) => void;
  placeholder?: string;
  maxHeight?: string;
}

export function ApproachSelector({
  value = [],
  onChange,
  placeholder = "חפש גישה או תאורטיקן...",
  maxHeight = "400px",
}: ApproachSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
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
        </div>
      )}
    </div>
  );
}
