import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { getSessionFromToken, requireRole } from "@/lib/rbac";
import { apiError } from "@/lib/api-error";

// 取得當前品牌 / 分店底下的員工：
// - OWNER：看到整個品牌的所有員工
// - MANAGER：只看到自己分店的員工
export async function GET(request: NextRequest) {
  const session = await getSessionFromToken(request);
  const authError = requireRole([Role.OWNER, Role.MANAGER])(session);
  if (authError) return authError;

  const brandId = session!.brandId;
  if (!brandId) {
    return apiError("BRAND_NOT_FOUND", "您必須屬於某個品牌才能查看員工列表", 400);
  }

  try {
    let where: { brandId: string; storeId?: string | null } = { brandId };

    if (session!.role === Role.MANAGER) {
      const manager = (await prisma.user.findUnique({
        where: { id: session!.id },
      })) as any;

      if (!manager?.storeId) {
        return apiError("MANAGER_STORE_NOT_BOUND", "分店長尚未綁定分店，無法查看員工列表", 400);
      }

      where.storeId = manager.storeId as string;
    }

    const rawUsers = (await prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        store: {
          select: {
            name: true,
          },
        },
      } as any,
    })) as any[];

    const users = rawUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      storeName: u.store?.name ?? null,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Fetch staff list error:", error);
    return NextResponse.json(
      { code: "STAFF_LIST_FAILED", message: "取得員工列表失敗，請稍後再試" },
      { status: 500 }
    );
  }
}

