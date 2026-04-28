import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { apiError } from "@/lib/api-error";

/**
 * Generate unique subdomain from brand name
 */
function generateSubdomain(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "brand";

  let subdomain = base;
  let counter = 1;

  // Ensure uniqueness - simplified for demo, in production use transaction
  return subdomain;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return apiError("INVALID_INPUT", "請提供姓名、電子信箱和密碼", 400);
    }

    if (password.length < 8) {
      return apiError("WEAK_PASSWORD", "密碼至少需要 8 個字元", 400);
    }

    // Check if email already exists as OWNER (same email can be in different brands)
    const existingOwner = await prisma.user.findFirst({
      where: {
        email,
        role: "OWNER",
      },
    });

    if (existingOwner) {
      return apiError("EMAIL_ALREADY_EXISTS", "此電子信箱已註冊為品牌持有人", 400);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate unique subdomain
    let subdomain = generateSubdomain(name);
    const existingBrand = await prisma.brand.findUnique({
      where: { subdomain },
    });
    if (existingBrand) {
      subdomain = `${subdomain}-${Date.now().toString(36)}`;
    }

    // Create Brand and OWNER in transaction
    const result = await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: {
          name,
          subdomain,
        },
      });

      // 建立品牌的預設店家（訂單/庫存等功能會依 store 運作）
      const store = await tx.store.create({
        data: {
          brandId: brand.id,
          name: `${name} - 總店`,
        },
        select: { id: true },
      });

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: Role.OWNER,
          brandId: brand.id,
          storeId: store.id,
        },
      });

      return { brand, user, store };
    });

    return NextResponse.json({
      success: true,
      message: "註冊成功",
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        brandId: result.user.brandId,
      },
      brand: {
        id: result.brand.id,
        name: result.brand.name,
        subdomain: result.brand.subdomain,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { code: "REGISTER_FAILED", message: "註冊失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
