import { prisma } from "@/lib/prisma";
import { buildDailyStoreAggregates } from "@/lib/analytics-preaggregation";

export type OverviewBaseInput = {
  brandId: string;
  storeIds: string[];
  stores: { id: string; name: string }[];
  start: Date;
  end: Date;
  days: number;
};

export type OverviewLoadedData = OverviewBaseInput & {
  dailyRows: Array<{
    storeId: string;
    date: Date;
    revenue: number;
    orderCount: number;
    cancelCount: number;
    overtimeEligibleCount: number;
    overtimeCount: number;
    cashCount: number;
    cardCount: number;
  }>;
  orders: any[];
  customizations: { label: string; quantity: number; priceDelta: number }[];
  menuItems: Array<{
    id: string;
    categories: string[];
    recipeLines: { ingredientId: string; quantity: number }[];
    customizations: {
      label: string;
      extraRecipeLines: { ingredientId: string; quantity: number }[];
    }[];
  }>;
  inventories: { storeId: string | null; ingredientId: string; quantity: number }[];
  ingredients: { id: string; name: string; unit: string }[];
};

export type OverviewCalculatedMetrics = {
  summary: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    cancelRate: number;
    overtimeRate: number;
  };
  charts: {
    peakHours: { hour: number; salesQty: number; orderCount: number }[];
    topProducts: { name: string; quantity: number; revenue: number }[];
    topCategories: { category: string; quantity: number }[];
    paymentMethods: { method: string; count: number; revenue: number }[];
    salesTrend: { date: string; revenue: number; orderCount: number; canceled: number }[];
    staffRanking: {
      userId: string;
      name: string;
      orderCount: number;
      revenue: number;
      avgOrderValue: number;
    }[];
    storeComparison: {
      storeId: string;
      storeName: string;
      revenue: number;
      orders: number;
      cancelRate: number;
      overtimeRate: number;
    }[];
    inventoryBurn: {
      ingredientId: string;
      ingredientName: string;
      unit: string;
      consumed: number;
      dailyUsage: number;
      currentStock: number;
      estimatedDaysLeft: number | null;
    }[];
  };
};

export async function loadOverviewData(input: OverviewBaseInput): Promise<OverviewLoadedData> {
  const { brandId, storeIds, start, end } = input;

  await buildDailyStoreAggregates({ brandId, storeIds, start, end });

  const dailyRows = (await (prisma as any).analyticsDailyStore.findMany({
    where: {
      brandId,
      storeId: { in: storeIds },
      date: { gte: startOfDayUTC(start), lte: startOfDayUTC(end) },
    },
    select: {
      storeId: true,
      date: true,
      revenue: true,
      orderCount: true,
      cancelCount: true,
      overtimeEligibleCount: true,
      overtimeCount: true,
      cashCount: true,
      cardCount: true,
    },
    orderBy: { date: "asc" },
  })) as OverviewLoadedData["dailyRows"];

  const orders = (await prisma.order.findMany({
    where: { brandId, storeId: { in: storeIds }, placedAt: { gte: start, lte: end } },
    select: {
      id: true,
      storeId: true,
      total: true,
      status: true,
      paymentMethod: true,
      placedAt: true,
      customerEta: true,
      readyAt: true,
      createdByUserId: true,
      createdByUser: { select: { name: true, email: true } },
      items: {
        select: {
          id: true,
          menuItemId: true,
          name: true,
          quantity: true,
          unitPrice: true,
        },
      },
    } as any,
    orderBy: { placedAt: "asc" },
  })) as any[];

  const orderIds = orders.map((o) => o.id);
  const customizations = orderIds.length
    ? await prisma.orderItemCustomization.findMany({
        where: { orderItem: { orderId: { in: orderIds } } },
        select: { label: true, quantity: true, priceDelta: true },
      })
    : [];

  const menuItemIds = Array.from(
    new Set(
      orders.flatMap((o) =>
        (o.items as Array<{ menuItemId: string }>).map((it) => it.menuItemId)
      )
    )
  );
  const menuItems = menuItemIds.length
    ? await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } },
        select: {
          id: true,
          categories: true,
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

  const ingredientIds = Array.from(
    new Set(
      menuItems.flatMap((m) => [
        ...m.recipeLines.map((r) => r.ingredientId),
        ...m.customizations.flatMap((c) => c.extraRecipeLines.map((r) => r.ingredientId)),
      ])
    )
  );

  const [inventories, ingredients] = await Promise.all([
    ingredientIds.length
      ? prisma.inventory.findMany({
          where: { brandId, storeId: { in: storeIds }, ingredientId: { in: ingredientIds } },
          select: { storeId: true, ingredientId: true, quantity: true },
        })
      : Promise.resolve([]),
    ingredientIds.length
      ? prisma.ingredient.findMany({
          where: { id: { in: ingredientIds } },
          select: { id: true, name: true, unit: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    ...input,
    dailyRows,
    orders,
    customizations,
    menuItems,
    inventories,
    ingredients,
  };
}

export function calculateOverviewMetrics(data: OverviewLoadedData): OverviewCalculatedMetrics {
  const { dailyRows, orders, customizations, menuItems, inventories, ingredients, storeIds, days, stores } =
    data;
  const menuById = new Map(menuItems.map((m) => [m.id, m]));
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));
  const inventoryByStoreIngredient = new Map(
    inventories.map((inv) => [`${inv.storeId}:${inv.ingredientId}`, inv.quantity])
  );
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  const peakByHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, salesQty: 0, orderCount: 0 }));
  const salesTrendMap = new Map<string, { date: string; revenue: number; orderCount: number; canceled: number }>();
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  const categoryMap = new Map<string, number>();
  const paymentMap = new Map<string, { method: string; count: number; revenue: number }>();
  const staffMap = new Map<string, { userId: string; name: string; orderCount: number; revenue: number; avgOrderValue: number }>();
  const storeMap = new Map<string, { storeId: string; storeName: string; revenue: number; orders: number; cancelRate: number; overtimeRate: number }>();
  const ingredientConsumption = new Map<string, number>();

  for (const order of orders) {
    const hour = order.placedAt.getHours();
    const salesQty = (order.items as Array<{ quantity: number }>).reduce(
      (acc: number, item: { quantity: number }) => acc + Math.max(0, item.quantity),
      0
    );
    peakByHour[hour].salesQty += salesQty;
    peakByHour[hour].orderCount += 1;

    if (order.createdByUserId) {
      const displayName =
        order.createdByUser?.name?.trim() || order.createdByUser?.email?.split("@")[0] || "未知員工";
      const staff = staffMap.get(order.createdByUserId) ?? {
        userId: order.createdByUserId,
        name: displayName,
        orderCount: 0,
        revenue: 0,
        avgOrderValue: 0,
      };
      staff.orderCount += 1;
      if (order.status !== "CANCELLED") staff.revenue += order.total;
      staffMap.set(order.createdByUserId, staff);
    }

    for (const item of order.items) {
      const product = productMap.get(item.menuItemId) ?? { name: item.name, quantity: 0, revenue: 0 };
      product.quantity += item.quantity;
      if (order.status !== "CANCELLED") product.revenue += item.unitPrice * item.quantity;
      productMap.set(item.menuItemId, product);

      const menu = menuById.get(item.menuItemId);
      if (!menu) continue;
      const categories = menu.categories.length > 0 ? menu.categories : ["未分類"];
      for (const c of categories) categoryMap.set(c, (categoryMap.get(c) ?? 0) + item.quantity);
      for (const line of menu.recipeLines) {
        const used = line.quantity * item.quantity;
        ingredientConsumption.set(line.ingredientId, (ingredientConsumption.get(line.ingredientId) ?? 0) + used);
      }
    }
  }

  for (const row of dailyRows) {
    const dateKey = row.date.toISOString().slice(0, 10);
    const trend = salesTrendMap.get(dateKey) ?? { date: dateKey, revenue: 0, orderCount: 0, canceled: 0 };
    trend.revenue += row.revenue;
    trend.orderCount += row.orderCount;
    trend.canceled += row.cancelCount;
    salesTrendMap.set(dateKey, trend);

    const cash = paymentMap.get("CASH") ?? { method: "CASH", count: 0, revenue: 0 };
    cash.count += row.cashCount;
    paymentMap.set("CASH", cash);
    const card = paymentMap.get("CARD") ?? { method: "CARD", count: 0, revenue: 0 };
    card.count += row.cardCount;
    paymentMap.set("CARD", card);

    const rowsForStore = dailyRows.filter((x) => x.storeId === row.storeId);
    const totalOvertimeEligible = rowsForStore.reduce((acc, x) => acc + x.overtimeEligibleCount, 0);
    const totalOvertime = rowsForStore.reduce((acc, x) => acc + x.overtimeCount, 0);
    const totalCancel = rowsForStore.reduce((acc, x) => acc + x.cancelCount, 0);
    const byStore = storeMap.get(row.storeId) ?? {
      storeId: row.storeId,
      storeName: storeNameById.get(row.storeId) ?? "未知分店",
      revenue: 0,
      orders: 0,
      cancelRate: 0,
      overtimeRate: 0,
    };
    byStore.revenue += row.revenue;
    byStore.orders += row.orderCount;
    byStore.cancelRate = byStore.orders > 0 ? totalCancel / byStore.orders : 0;
    byStore.overtimeRate = totalOvertimeEligible > 0 ? totalOvertime / totalOvertimeEligible : 0;
    storeMap.set(row.storeId, byStore);
  }

  for (const c of customizations) {
    const match = menuItems.flatMap((m) => m.customizations).find((x) => x.label === c.label);
    if (!match) continue;
    for (const line of match.extraRecipeLines) {
      const used = line.quantity * c.quantity;
      ingredientConsumption.set(line.ingredientId, (ingredientConsumption.get(line.ingredientId) ?? 0) + used);
    }
  }

  const overtimeEligibleTotal = dailyRows.reduce((acc, row) => acc + row.overtimeEligibleCount, 0);
  const overtimeCountTotal = dailyRows.reduce((acc, row) => acc + row.overtimeCount, 0);
  const totalOrdersByAgg = dailyRows.reduce((acc, row) => acc + row.orderCount, 0);
  const totalCancelByAgg = dailyRows.reduce((acc, row) => acc + row.cancelCount, 0);
  const totalRevenueByAgg = dailyRows.reduce((acc, row) => acc + row.revenue, 0);

  const staffRanking = Array.from(staffMap.values())
    .map((s) => ({ ...s, avgOrderValue: s.orderCount > 0 ? Math.round(s.revenue / s.orderCount) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const inventoryBurn = Array.from(ingredientConsumption.entries())
    .map(([ingredientId, consumed]) => {
      const ingredient = ingredientById.get(ingredientId);
      const currentStock = storeIds.reduce(
        (sum, sid) => sum + (inventoryByStoreIngredient.get(`${sid}:${ingredientId}`) ?? 0),
        0
      );
      const dailyUsage = consumed / Math.max(1, days);
      const daysLeft = dailyUsage > 0 ? currentStock / dailyUsage : null;
      return {
        ingredientId,
        ingredientName: ingredient?.name ?? "未知原料",
        unit: ingredient?.unit ?? "份",
        consumed: Math.round(consumed),
        dailyUsage: Number(dailyUsage.toFixed(2)),
        currentStock,
        estimatedDaysLeft: daysLeft == null ? null : Number(daysLeft.toFixed(1)),
      };
    })
    .sort((a, b) => b.dailyUsage - a.dailyUsage)
    .slice(0, 10);

  return {
    summary: {
      totalRevenue: totalRevenueByAgg,
      totalOrders: totalOrdersByAgg,
      avgOrderValue:
        totalOrdersByAgg - totalCancelByAgg > 0
          ? Math.round(totalRevenueByAgg / (totalOrdersByAgg - totalCancelByAgg))
          : 0,
      cancelRate: totalOrdersByAgg > 0 ? totalCancelByAgg / totalOrdersByAgg : 0,
      overtimeRate: overtimeEligibleTotal > 0 ? overtimeCountTotal / overtimeEligibleTotal : 0,
    },
    charts: {
      peakHours: peakByHour,
      topProducts: Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      topCategories: Array.from(categoryMap.entries())
        .map(([category, quantity]) => ({ category, quantity }))
        .sort((a, b) => b.quantity - a.quantity),
      paymentMethods: Array.from(paymentMap.values()).sort((a, b) => b.count - a.count),
      salesTrend: Array.from(salesTrendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      staffRanking,
      storeComparison: Array.from(storeMap.values()).sort((a, b) => b.revenue - a.revenue),
      inventoryBurn,
    },
  };
}

export function formatOverviewResponse(params: {
  role: "OWNER" | "MANAGER";
  range: { start: Date; end: Date; days: number };
  stores: { id: string; name: string }[];
  selectedStoreId: string | null;
  forceRefreshed: boolean;
  metrics: OverviewCalculatedMetrics;
}) {
  const generatedAt = new Date().toISOString();
  return {
    role: params.role,
    range: params.range,
    stores: params.stores,
    selectedStoreId: params.selectedStoreId,
    meta: {
      generatedAt,
      cacheStatus: "MISS",
      updateCadence: "TTL 5 分鐘；訂單異動後重新請求可更新",
      forceRefreshed: params.forceRefreshed,
    },
    summary: params.metrics.summary,
    charts: params.metrics.charts,
  };
}

function startOfDayUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
