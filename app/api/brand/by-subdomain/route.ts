import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/brand/by-subdomain?subdomain=xxx
 * Used by layouts to verify brand exists and get brandId
 */
export async function GET(request: NextRequest) {
  const subdomain = request.nextUrl.searchParams.get("subdomain");
  if (!subdomain) {
    return NextResponse.json(
      { error: "缺少 subdomain 參數" },
      { status: 400 }
    );
  }

  const brand = await prisma.brand.findUnique({
    where: { subdomain },
  });

  if (!brand) {
    return NextResponse.json({ error: "找不到該品牌", brand: null }, { status: 404 });
  }

  return NextResponse.json({ brand });
}
