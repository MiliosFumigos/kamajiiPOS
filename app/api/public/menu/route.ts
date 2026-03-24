import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSubdomainFromHost } from "@/lib/subdomain";

function mapMenuItems(items: {
  id: string;
  name: string;
  price: number;
  dailyLimit: number;
  prepMinutes: number;
  imageUrl: string | null;
  categories: string[];
  recipeLines: { ingredientId: string; quantity: number }[];
  customizations: {
    id: string;
    label: string;
    priceDelta: number;
    maxQuantity: number;
    extraRecipeLines: { ingredientId: string; quantity: number }[];
  }[];
}[]) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    dailyLimit: item.dailyLimit,
    prepMinutes: item.prepMinutes,
    imageUrl: item.imageUrl ?? undefined,
    categories: item.categories ?? [],
    recipe: item.recipeLines.map((r) => ({
      ingredientId: r.ingredientId,
      quantity: r.quantity,
    })),
    customizations: item.customizations.map((c) => ({
      id: c.id,
      label: c.label,
      priceDelta: c.priceDelta,
      maxQuantity: c.maxQuantity,
      recipe: c.extraRecipeLines.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
      })),
    })),
  }));
}

/**
 * 公開菜單（給 Kiosk / 客戶端）：依 host 子網域找品牌
 * GET /api/public/menu
 */
export async function GET(request: Request) {
  const host = request.headers.get("host") || "";
  const subdomain = getSubdomainFromHost(host);
  if (!subdomain) {
    return NextResponse.json(
      { error: "請使用品牌子網域存取" },
      { status: 400 }
    );
  }

  const brand = await prisma.brand.findUnique({
    where: { subdomain },
    select: { id: true },
  });
  if (!brand) {
    return NextResponse.json({ error: "找不到該品牌" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId")?.trim();
  if (!storeId) {
    return NextResponse.json(
      { error: "缺少 storeId（請使用分店專屬 QR code / 連結）" },
      { status: 400 }
    );
  }

  const store = await prisma.store.findFirst({
    where: { id: storeId, brandId: brand.id },
    select: { id: true },
  });
  if (!store) {
    return NextResponse.json({ error: "找不到該分店" }, { status: 404 });
  }

  const items = await prisma.menuItem.findMany({
    where: {
      brandId: brand.id,
      storeId: store.id,
      isActive: true,
    },
    include: {
      recipeLines: {
        select: { ingredientId: true, quantity: true },
      },
      customizations: {
        select: {
          id: true,
          label: true,
          priceDelta: true,
          maxQuantity: true,
          extraRecipeLines: {
            select: { ingredientId: true, quantity: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ items: mapMenuItems(items) });
}

