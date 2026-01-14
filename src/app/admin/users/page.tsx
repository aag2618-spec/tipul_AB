"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { 
  Loader2, 
  Search, 
  Plus, 
  Pencil, 
  Trash2, 
  Ban, 
  CheckCircle,
  Users,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "USER" | "ADMIN";
  isBlocked: boolean;
  createdAt: string;
  _count: {
    clients: number;
    therapySessions: number;
    apiUsageLogs: number;
  };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "USER" as "USER" | "ADMIN",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [search]);

  const fetchUsers = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      
      const response = await fetch(`/api/admin/users?${params}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      const url = editingUser 
        ? `/api/admin/users/${editingUser.id}`
        : "/api/admin/users";
      
      const method = editingUser ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }

      toast.success(editingUser ? "המשתמש עודכן בהצלחה" : "המשתמש נוצר בהצלחה");
      setIsDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }

      toast.success("המשתמש נמחק בהצלחה");
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה במחיקה");
    }
  };

  const handleToggleBlock = async (user: User) => {
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: !user.isBlocked }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }

      toast.success(user.isBlocked ? "המשתמש הופעל" : "המשתמש נחסם");
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "אירעה שגיאה");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      phone: "",
      role: "USER",
    });
    setEditingUser(null);
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name || "",
      email: user.email || "",
      password: "",
      phone: user.phone || "",
      role: user.role,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ניהול משתמשים</h1>
          <p className="text-slate-400 mt-1">{total} משתמשים במערכת</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black">
              <Plus className="ml-2 h-4 w-4" />
              משתמש חדש
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingUser ? "עריכת משתמש" : "משתמש חדש"}
              </DialogTitle>
              <DialogDescription>
                {editingUser ? "עדכן את פרטי המשתמש" : "הזן את פרטי המשתמש החדש"}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>שם</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              
              <div className="space-y-2">
                <Label>אימייל</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              
              <div className="space-y-2">
                <Label>{editingUser ? "סיסמה חדשה (השאר ריק לשמירה)" : "סיסמה"}</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              
              <div className="space-y-2">
                <Label>טלפון</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              
              <div className="space-y-2">
                <Label>תפקיד</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: "USER" | "ADMIN") => 
                    setFormData({ ...formData, role: value })
                  }
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">משתמש</SelectItem>
                    <SelectItem value="ADMIN">מנהל</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                className="text-slate-400"
              >
                ביטול
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSaving}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingUser ? (
                  "עדכן"
                ) : (
                  "צור משתמש"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="חיפוש לפי שם או אימייל..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10 bg-slate-800 border-slate-700"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>לא נמצאו משתמשים</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">משתמש</TableHead>
                  <TableHead className="text-slate-400">תפקיד</TableHead>
                  <TableHead className="text-slate-400">סטטוס</TableHead>
                  <TableHead className="text-slate-400">מטופלים</TableHead>
                  <TableHead className="text-slate-400">קריאות API</TableHead>
                  <TableHead className="text-slate-400">נוצר</TableHead>
                  <TableHead className="text-slate-400">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="border-slate-800">
                    <TableCell>
                      <div>
                        <p className="font-medium text-white">{user.name || "ללא שם"}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={user.role === "ADMIN" ? "default" : "secondary"}
                        className={user.role === "ADMIN" ? "bg-amber-500/20 text-amber-500" : ""}
                      >
                        {user.role === "ADMIN" ? (
                          <><Shield className="ml-1 h-3 w-3" /> מנהל</>
                        ) : (
                          <><UserIcon className="ml-1 h-3 w-3" /> משתמש</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isBlocked ? "destructive" : "outline"}>
                        {user.isBlocked ? "חסום" : "פעיל"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">{user._count.clients}</TableCell>
                    <TableCell className="text-slate-300">{user._count.apiUsageLogs}</TableCell>
                    <TableCell className="text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString("he-IL")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                          className="text-slate-400 hover:text-white"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleBlock(user)}
                          className={user.isBlocked ? "text-green-500 hover:text-green-400" : "text-orange-500 hover:text-orange-400"}
                        >
                          {user.isBlocked ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Ban className="h-4 w-4" />
                          )}
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-slate-900 border-slate-800">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-white">
                                מחיקת משתמש
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                האם אתה בטוח שברצונך למחוק את {user.name || user.email}?
                                פעולה זו תמחק את כל הנתונים של המשתמש ולא ניתן לשחזר.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-slate-800 border-slate-700">
                                ביטול
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(user.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                מחק
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
