import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { getSessionFromToken, requireRole } from "@/lib/rbac";
import { apiError } from "@/lib/api-error";

// 建立員工（STAFF） - 由分店長建立，同一品牌、同一分店
export async function POST(request: NextRequest) {
  const session = await getSessionFromToken(request);
  const authError = requireRole([Role.MANAGER])(session);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return apiError("INVALID_INPUT", "請提供姓名、電子信箱和密碼", 400);
    }

    if (password.length < 8) {
      return apiError("WEAK_PASSWORD", "密碼至少需要 8 個字元", 400);
    }

    // 取出分店長自己的資料，取得 brandId / storeId
    const manager = await prisma.user.findUnique({
      where: { id: session!.id },
      select: { brandId: true, storeId: true },
    });

    if (!manager?.brandId || !manager.storeId) {
      return apiError("MANAGER_STORE_NOT_BOUND", "分店長尚未綁定品牌或分店，無法建立員工", 400);
    }

    // 檢查同品牌同 email 是否已存在
    const existingUser = await prisma.user.findUnique({
      where: {
        email_brandId: { email, brandId: manager.brandId },
      },
    });

    if (existingUser) {
      return apiError("EMAIL_ALREADY_EXISTS", "此電子信箱已在該品牌中註冊", 400);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const staff = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.STAFF,
        brandId: manager.brandId,
        storeId: manager.storeId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "員工建立成功",
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      },
    });
  } catch (error) {
    console.error("Create staff error:", error);
    return NextResponse.json(
      { code: "STAFF_CREATE_FAILED", message: "建立員工失敗，請稍後再試" },
      { status: 500 }
    );
  }
}

