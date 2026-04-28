import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

/**
 * GET /api/brand/by-subdomain?subdomain=xxx
 * Used by layouts to verify brand exists and get brandId
 */
export async function GET(request: NextRequest) {
  const subdomain = request.nextUrl.searchParams.get("subdomain");
  if (!subdomain) {
    return apiError("MISSING_SUBDOMAIN", "缺少 subdomain 參數", 400);
  }

  const brand = await prisma.brand.findUnique({
    where: { subdomain },
  });

  if (!brand) {
    return NextResponse.json(
      { code: "BRAND_NOT_FOUND", message: "找不到該品牌", details: { brand: null } },
      { status: 404 }
    );
  }

  return NextResponse.json({ brand });
}
