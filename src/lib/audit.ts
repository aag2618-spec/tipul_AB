import { prisma } from "@/lib/prisma";

export async function logAdminAction(params: {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  return prisma.adminAuditLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
    },
  });
}
