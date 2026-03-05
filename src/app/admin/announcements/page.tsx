"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Info,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Loader2,
  X,
  Users,
  Calendar,
} from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  isActive: boolean;
  showBanner: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: "active" | "expired" | "inactive";
  dismissalCount: number;
}

const TYPE_OPTIONS = [
  { value: "info", label: "מידע", icon: Info, color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/30" },
  { value: "warning", label: "אזהרה", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/20", border: "border-amber-500/30" },
  { value: "success", label: "הצלחה", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/20", border: "border-emerald-500/30" },
  { value: "update", label: "עדכון", icon: Sparkles, color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/30" },
];

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    type: "info",
    expiresAt: "",
    showBanner: true,
  });

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/announcements");
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements);
      }
    } catch (error) {
      console.error("Error fetching announcements:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          expiresAt: formData.expiresAt || null,
        }),
      });

      if (res.ok) {
        setFormData({ title: "", content: "", type: "info", expiresAt: "", showBanner: true });
        setShowForm(false);
        fetchAnnouncements();
      }
    } catch (error) {
      console.error("Error creating announcement:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      if (res.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error("Error toggling announcement:", error);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("האם למחוק את ההודעה?")) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error("Error deleting announcement:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const getTypeConfig = (type: string) => {
    return TYPE_OPTIONS.find((t) => t.value === type) || TYPE_OPTIONS[0];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">פעיל</span>;
      case "expired":
        return <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30">פג תוקף</span>;
      case "inactive":
        return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30">לא פעיל</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg">
            <Bell className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">הודעות מערכת</h1>
            <p className="text-sm text-muted-foreground">ניהול הודעות ובאנרים למשתמשים</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "ביטול" : "הודעה חדשה"}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-foreground">יצירת הודעה חדשה</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">כותרת</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="כותרת ההודעה"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">סוג</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">תוכן</label>
            <textarea
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
              placeholder="תוכן ההודעה שתוצג למשתמשים"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                תאריך תפוגה (אופציונלי)
              </label>
              <input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.showBanner}
                  onChange={(e) => setFormData({ ...formData, showBanner: e.target.checked })}
                  className="rounded border-border"
                />
                <span className="text-sm text-muted-foreground">הצג כבאנר בדשבורד</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "שומר..." : "צור הודעה"}
            </button>
          </div>
        </form>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">סה&quot;כ הודעות</p>
          <p className="text-2xl font-bold text-foreground">{announcements.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">פעילות</p>
          <p className="text-2xl font-bold text-emerald-400">
            {announcements.filter((a) => a.status === "active").length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">פג תוקף / לא פעיל</p>
          <p className="text-2xl font-bold text-red-400">
            {announcements.filter((a) => a.status !== "active").length}
          </p>
        </div>
      </div>

      {/* Announcements List */}
      {announcements.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-foreground">אין הודעות עדיין</p>
          <p className="text-sm text-muted-foreground mt-1">צור הודעה חדשה כדי להציג אותה למשתמשים</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => {
            const typeConfig = getTypeConfig(announcement.type);
            const TypeIcon = typeConfig.icon;

            return (
              <div
                key={announcement.id}
                className={`bg-card border border-border rounded-xl p-5 transition-all hover:border-border/80 ${
                  announcement.status !== "active" ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${typeConfig.bg} mt-0.5`}>
                      <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{announcement.title}</h3>
                        {getStatusBadge(announcement.status)}
                        <span className={`px-2 py-0.5 rounded-full text-xs ${typeConfig.bg} ${typeConfig.color} border ${typeConfig.border}`}>
                          {typeConfig.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {announcement.content}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(announcement.createdAt).toLocaleDateString("he-IL")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {announcement.dismissalCount} דחו
                        </span>
                        {announcement.expiresAt && (
                          <span>
                            תפוגה: {new Date(announcement.expiresAt).toLocaleDateString("he-IL")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(announcement.id, announcement.isActive)}
                      disabled={togglingId === announcement.id}
                      className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title={announcement.isActive ? "השבת" : "הפעל"}
                    >
                      {togglingId === announcement.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : announcement.isActive ? (
                        <ToggleRight className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(announcement.id)}
                      disabled={deletingId === announcement.id}
                      className="p-2 rounded-lg hover:bg-red-500/20 transition-colors text-muted-foreground hover:text-red-400"
                      title="מחק"
                    >
                      {deletingId === announcement.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
