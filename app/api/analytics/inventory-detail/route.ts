import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { apiError } from "@/lib/api-error";

function toDayStartUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateOnlyToUTC(input: string | null): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const dt = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function resolveDateRange(daysRaw: string | null, startDateRaw: string | null, endDateRaw: string | null) {
  const parsedStart = parseDateOnlyToUTC(startDateRaw);
  const parsedEnd = parseDateOnlyToUTC(endDateRaw);
  if (parsedStart && parsedEnd && parsedStart.getTime() <= parsedEnd.getTime()) {
    const start = toDayStartUTC(parsedStart);
    const end = new Date(Date.UTC(parsedEnd.getUTCFullYear(), parsedEnd.getUTCMonth(), parsedEnd.getUTCDate(), 23, 59, 59, 999));
    const days = Math.floor((toDayStartUTC(parsedEnd).getTime() - start.getTime()) / 86_400_000) + 1;
    return { start, end, days: Math.max(1, Math.min(180, days)) };
  }
  const d = Number(daysRaw ?? "30");
  const days = Number.isFinite(d) ? Math.max(7, Math.min(180, Math.floor(d))) : 30;
  const end = new Date();
  const start = toDayStartUTC(new Date(end.getTime() - (days - 1) * 86_400_000));
  return { start, end, days };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return apiError("UNAUTHORIZED", "Unauthorized", 401);
  if (session.user.role !== Role.OWNER && session.user.role !== Role.MANAGER) {
    return apiError("FORBIDDEN", "Forbidden", 403);
  }
  if (!session.user.brandId) return apiError("BRAND_NOT_FOUND", "Brand not found for user", 400);

  const { searchParams } = new URL(request.url);
  const ingredientId = searchParams.get("ingredientId")?.trim();
  if (!ingredientId) return apiError("MISSING_INGREDIENT_ID", "Missing ingredientId", 400);
  const includeCancelled = searchParams.get("includeCancelled") !== "0";

  const { start, end, days } = resolveDateRange(
    searchParams.get("days"),
    searchParams.get("startDate"),
    searchParams.get("endDate")
  );

  const requestedStoreId = searchParams.get("storeId")?.trim() || null;
  const scopedStoreId =
    session.user.role === Role.MANAGER ? session.user.storeId : requestedStoreId;
  if (session.user.role === Role.MANAGER && !session.user.storeId) {
    return apiError("STORE_NOT_FOUND", "Store not found for manager", 400);
  }

  const stores = await prisma.store.findMany({
    where: {
      brandId: session.user.brandId,
      ...(scopedStoreId ? { id: scopedStoreId } : {}),
    },
    select: { id: true, name: true },
  });
  if (stores.length === 0) {
    return NextResponse.json({
      ingredientId,
      ingredientName: "未知原料",
      unit: "份",
      totalConsumed: 0,
      contributors: [],
      customizationContributors: [],
      range: { start, end, days },
    });
  }

  const storeIds = stores.map((s) => s.id);
  const orders = (await prisma.order.findMany({
    where: {
      brandId: session.user.brandId,
      storeId: { in: storeIds },
      placedAt: { gte: start, lte: end },
      ...(includeCancelled ? {} : { status: { not: "CANCELLED" as any } }),
    },
    select: {
      id: true,
      status: true,
      items: { select: { id: true, menuItemId: true, name: true, quantity: true } },
    },
  })) as any[];

  const orderIds = orders.map((o) => o.id);
  const menuItemIds = Array.from(
    new Set(orders.flatMap((o) => (o.items as any[]).map((it) => it.menuItemId)))
  );
  const menuItems = menuItemIds.length
    ? await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } },
        select: {
          id: true,
          recipeLines: { select: { ingredientId: true, quantity: true } },
          customizations: {
            select: {
              label: true,
              extraRecipeLines: { select: { ingredientId: true, quantity: true } },
            },
          },
        },
      })
    : [];
  const menuById = new Map(menuItems.map((m) => [m.id, m]));

  const ingredient = await prisma.ingredient.findUnique({
    where: { id: ingredientId },
    select: { id: true, name: true, unit: true },
  });

  const productContribution = new Map<string, { name: string; consumed: number; quantity: number }>();
  let totalConsumed = 0;
  for (const order of orders) {
    for (const item of order.items as any[]) {
      const menu = menuById.get(item.menuItemId);
      if (!menu) continue;
      const recipeLine = menu.recipeLines.find((line) => line.ingredientId === ingredientId);
      if (!recipeLine) continue;
      const consumed = recipeLine.quantity * item.quantity;
      totalConsumed += consumed;
      const row = productContribution.get(item.menuItemId) ?? {
        name: item.name,
        consumed: 0,
        quantity: 0,
      };
      row.consumed += consumed;
      row.quantity += item.quantity;
      productContribution.set(item.menuItemId, row);
    }
  }

  const customizations = orderIds.length
    ? await prisma.orderItemCustomization.findMany({
        where: { orderItem: { orderId: { in: orderIds } } },
        select: { label: true, quantity: true },
      })
    : [];
  const customizationContribution = new Map<string, number>();
  for (const c of customizations) {
    const match = menuItems
      .flatMap((m) => m.customizations)
      .find((x) => x.label === c.label);
    if (!match) continue;
    const line = match.extraRecipeLines.find((r) => r.ingredientId === ingredientId);
    if (!line) continue;
    const consumed = line.quantity * c.quantity;
    totalConsumed += consumed;
    customizationContribution.set(c.label, (customizationContribution.get(c.label) ?? 0) + consumed);
  }

  return NextResponse.json({
    ingredientId,
    ingredientName: ingredient?.name ?? "未知原料",
    unit: ingredient?.unit ?? "份",
    totalConsumed,
    contributors: Array.from(productContribution.values())
      .sort((a, b) => b.consumed - a.consumed)
      .slice(0, 10),
    customizationContributors: Array.from(customizationContribution.entries())
      .map(([label, consumed]) => ({ label, consumed }))
      .sort((a, b) => b.consumed - a.consumed)
      .slice(0, 10),
    formulaSummary:
      "總消耗 = Σ(商品售出份數 × 該商品配方中的此原料用量) + Σ(客製化選項數量 × 該客製化額外用量)",
    assumptions: [
      includeCancelled
        ? "目前計算包含已取消訂單。"
        : "目前計算僅包含未取消訂單。",
      "此數值為依配方推估，不含人工盤點/報廢/補貨調整。",
    ],
    includeCancelled,
    range: { start, end, days },
  });
}
