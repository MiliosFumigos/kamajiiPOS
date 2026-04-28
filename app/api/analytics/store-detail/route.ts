import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { apiError } from "@/lib/api-error";

function toDayStartUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return apiError("UNAUTHORIZED", "Unauthorized", 401);
  if (session.user.role !== Role.OWNER && session.user.role !== Role.MANAGER) {
    return apiError("FORBIDDEN", "Forbidden", 403);
  }
  if (!session.user.brandId) return apiError("BRAND_NOT_FOUND", "Brand not found", 400);

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId")?.trim();
  const daysRaw = Number(searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysRaw) ? Math.min(180, Math.max(7, Math.floor(daysRaw))) : 30;
  if (!storeId) return apiError("MISSING_STORE_ID", "Missing storeId", 400);

  const scopedStoreId = session.user.role === Role.MANAGER ? session.user.storeId : storeId;
  if (!scopedStoreId) return apiError("STORE_NOT_FOUND", "Store not found", 400);
  if (session.user.role === Role.MANAGER && scopedStoreId !== session.user.storeId) {
    return apiError("FORBIDDEN", "Forbidden", 403);
  }

  const end = new Date();
  const start = toDayStartUTC(new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  const store = await prisma.store.findFirst({
    where: { id: scopedStoreId, brandId: session.user.brandId },
    select: { id: true, name: true },
  });
  if (!store) return apiError("STORE_NOT_FOUND", "Store not found", 404);

  const orders = await prisma.order.findMany({
    where: {
      brandId: session.user.brandId,
      storeId: scopedStoreId,
      placedAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      displayId: true,
      total: true,
      status: true,
      paymentMethod: true,
      placedAt: true,
      customerEta: true,
      readyAt: true,
      createdByUser: { select: { name: true, email: true } },
      items: { select: { name: true, quantity: true, unitPrice: true } },
    },
    orderBy: { placedAt: "desc" },
    take: 80,
  });

  const topProductsMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const existing = topProductsMap.get(item.name) ?? {
        name: item.name,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      if (order.status !== "CANCELLED") existing.revenue += item.quantity * item.unitPrice;
      topProductsMap.set(item.name, existing);
    }
  }

  return NextResponse.json({
    store,
    range: { start, end, days },
    summary: {
      revenue: orders
        .filter((o) => o.status !== "CANCELLED")
        .reduce((acc, o) => acc + o.total, 0),
      orders: orders.length,
      cancelRate:
        orders.length > 0
          ? orders.filter((o) => o.status === "CANCELLED").length / orders.length
          : 0,
    },
    topProducts: Array.from(topProductsMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
    recentOrders: orders.map((o) => ({
      id: o.id,
      displayId: o.displayId,
      total: o.total,
      status: o.status,
      paymentMethod: o.paymentMethod,
      placedAt: o.placedAt,
      staff:
        o.createdByUser?.name?.trim() || o.createdByUser?.email?.split("@")[0] || "未知員工",
      items: o.items,
    })),
  });
}
