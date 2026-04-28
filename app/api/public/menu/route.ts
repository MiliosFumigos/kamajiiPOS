import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiError } from "@/lib/api-error";

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function nextDayUTC(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  );
}

function mapItemsWithAvailability(
  items: {
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
  }[],
  soldByMenuId: Map<string, number>
) {
  return items.map((item) => {
    const soldToday = soldByMenuId.get(item.id) ?? 0;
    const remainingToday = Math.max(0, item.dailyLimit - soldToday);
    return {
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
      soldToday,
      remainingToday,
      soldOut: remainingToday <= 0,
    };
  });
}

/**
 * 公開菜單（給 Kiosk / 客戶端）：依 host 子網域找品牌
 * GET /api/public/menu
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = z
    .object({
      storeId: z.string().trim().min(1),
    })
    .safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return apiError("MISSING_STORE_ID", "缺少 storeId（請使用分店專屬 QR code / 連結）", 400);
  }
  const { storeId } = parsed.data;

  // path-based 多租戶時，api 不可靠 host/subdomain，改用 storeId 直接查出品牌
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, brandId: true },
  });
  if (!store) return apiError("STORE_NOT_FOUND", "找不到該分店", 404);

  const items = await prisma.menuItem.findMany({
    where: {
      brandId: store.brandId,
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

  const menuItemIds = items.map((i) => i.id);
  const soldByMenuId = new Map<string, number>();
  if (menuItemIds.length > 0) {
    const now = new Date();
    const dayStart = startOfDayUTC(now);
    const dayEnd = nextDayUTC(now);
    const soldRows = await prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: {
        menuItemId: { in: menuItemIds },
        order: {
          storeId: store.id,
          placedAt: { gte: dayStart, lt: dayEnd },
          status: { not: "CANCELLED" as any },
        },
      },
      _sum: {
        quantity: true,
      },
    });
    for (const row of soldRows) {
      soldByMenuId.set(row.menuItemId, row._sum.quantity ?? 0);
    }
  }

  return NextResponse.json({
    items: mapItemsWithAvailability(items, soldByMenuId),
  });
}

