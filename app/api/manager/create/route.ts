import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { getSessionFromToken, requireRole } from "@/lib/rbac";
import { apiError } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  const session = await getSessionFromToken(request);
  const authError = requireRole([Role.OWNER])(session);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { name, email, password, storeName } = body;

    if (!name || !email || !password || !storeName) {
      return apiError("INVALID_INPUT", "請提供姓名、電子信箱、密碼與分店名稱", 400);
    }

    if (password.length < 8) {
      return apiError("WEAK_PASSWORD", "密碼至少需要 8 個字元", 400);
    }

    const brandId = session!.brandId;
    if (!brandId) {
      return apiError("BRAND_NOT_FOUND", "您必須屬於某個品牌才能建立經理", 400);
    }

    // Check if email already exists in this brand
    const existingUser = await prisma.user.findUnique({
      where: {
        email_brandId: { email, brandId },
      },
    });

    if (existingUser) {
      return apiError("EMAIL_ALREADY_EXISTS", "此電子信箱已在該品牌中註冊", 400);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: storeName,
          brandId,
        },
      });

      const manager = await tx.user.create({
        // schema 已新增 storeId，但本地 Prisma Client 型別尚未重新產生，
        // 先用 any 避免型別錯誤（重新執行 prisma generate 後可移除）。
        data: {
          name,
          email,
          password: hashedPassword,
          role: Role.MANAGER,
          brandId,
          storeId: store.id,
        } as any,
      });

      return { store, manager };
    });

    return NextResponse.json({
      success: true,
      message: "經理與分店建立成功",
      store: {
        id: result.store.id,
        name: result.store.name,
      },
      user: {
        id: result.manager.id,
        name: result.manager.name,
        email: result.manager.email,
        role: result.manager.role,
      },
    });
  } catch (error) {
    console.error("Create manager error:", error);
    return NextResponse.json(
      { code: "MANAGER_CREATE_FAILED", message: "建立經理失敗，請稍後再試" },
      { status: 500 }
    );
  }
}

