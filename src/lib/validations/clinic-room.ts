import { z } from "zod";

// שלב 2 (חדרים): ולידציית יצירה/עדכון של חדר טיפול בקליניקה.
// משמש את /api/clinic/rooms (POST) ו-/api/clinic/rooms/[id] (PUT).

export const createRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "שם החדר חובה")
    .max(100, "שם החדר ארוך מדי (עד 100 תווים)"),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const updateRoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "שם החדר חובה")
      .max(100, "שם החדר ארוך מדי (עד 100 תווים)")
      .optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined || d.isActive !== undefined || d.sortOrder !== undefined,
    { message: "לא נשלח שדה לעדכון" }
  );

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
