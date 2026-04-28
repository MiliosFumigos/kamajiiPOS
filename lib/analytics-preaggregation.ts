import { prisma } from "@/lib/prisma";

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function dayKeysInRange(start: Date, end: Date) {
  const keys: Date[] = [];
  let cursor = startOfUtcDay(start);
  const endDay = startOfUtcDay(end);
  while (cursor.getTime() <= endDay.getTime()) {
    keys.push(new Date(cursor.getTime()));
    cursor = nextUtcDay(cursor);
  }
  return keys;
}

export async function buildDailyStoreAggregates(params: {
  brandId: string;
  storeIds: string[];
  start: Date;
  end: Date;
}) {
  const { brandId, storeIds, start, end } = params;
  if (storeIds.length === 0) return;

  const dayKeys = dayKeysInRange(start, end);
  for (const dayStart of dayKeys) {
    const dayEnd = nextUtcDay(dayStart);
    const orders = await prisma.order.findMany({
      where: {
        brandId,
        storeId: { in: storeIds },
        placedAt: { gte: dayStart, lt: dayEnd },
      },
      select: {
        storeId: true,
        total: true,
        status: true,
        paymentMethod: true,
        customerEta: true,
        readyAt: true,
      },
    });

    const grouped = new Map<
      string,
      {
        revenue: number;
        orderCount: number;
        cancelCount: number;
        overtimeEligibleCount: number;
        overtimeCount: number;
        cashCount: number;
        cardCount: number;
      }
    >();

    for (const sid of storeIds) {
      grouped.set(sid, {
        revenue: 0,
        orderCount: 0,
        cancelCount: 0,
        overtimeEligibleCount: 0,
        overtimeCount: 0,
        cashCount: 0,
        cardCount: 0,
      });
    }

    for (const order of orders) {
      const g = grouped.get(order.storeId);
      if (!g) continue;
      g.orderCount += 1;
      if (order.status === "CANCELLED") {
        g.cancelCount += 1;
      } else {
        g.revenue += order.total;
      }
      if (order.paymentMethod === "CARD") g.cardCount += 1;
      else g.cashCount += 1;

      if (order.customerEta && order.readyAt) {
        g.overtimeEligibleCount += 1;
        if (order.readyAt.getTime() > order.customerEta.getTime()) {
          g.overtimeCount += 1;
        }
      }
    }

    const upserts = Array.from(grouped.entries()).map(([storeId, g]) =>
      prisma.analyticsDailyStore.upsert({
        where: { storeId_date: { storeId, date: dayStart } },
        update: {
          revenue: g.revenue,
          orderCount: g.orderCount,
          cancelCount: g.cancelCount,
          overtimeEligibleCount: g.overtimeEligibleCount,
          overtimeCount: g.overtimeCount,
          cashCount: g.cashCount,
          cardCount: g.cardCount,
        },
        create: {
          brandId,
          storeId,
          date: dayStart,
          revenue: g.revenue,
          orderCount: g.orderCount,
          cancelCount: g.cancelCount,
          overtimeEligibleCount: g.overtimeEligibleCount,
          overtimeCount: g.overtimeCount,
          cashCount: g.cashCount,
          cardCount: g.cardCount,
        },
      })
    );
    await prisma.$transaction(upserts);
  }
}
