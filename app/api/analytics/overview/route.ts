import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { getCachedAnalytics, setCachedAnalytics } from "@/lib/analytics-cache";
import {
  calculateOverviewMetrics,
  formatOverviewResponse,
  loadOverviewData,
} from "@/lib/analytics-overview-service";

function toDayStartUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function clampDateRange(daysRaw: string | null) {
  const daysParsed = Number(daysRaw ?? "30");
  const days = Number.isFinite(daysParsed)
    ? Math.min(180, Math.max(7, Math.floor(daysParsed)))
    : 30;
  const end = new Date();
  const start = toDayStartUTC(new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return { start, end, days };
}

function parseDateOnlyToUTC(input: string | null): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const dt = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function resolveDateRange(
  daysRaw: string | null,
  startDateRaw: string | null,
  endDateRaw: string | null
) {
  const parsedStart = parseDateOnlyToUTC(startDateRaw);
  const parsedEnd = parseDateOnlyToUTC(endDateRaw);
  if (parsedStart && parsedEnd && parsedStart.getTime() <= parsedEnd.getTime()) {
    const start = toDayStartUTC(parsedStart);
    const end = new Date(
      Date.UTC(
        parsedEnd.getUTCFullYear(),
        parsedEnd.getUTCMonth(),
        parsedEnd.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    const spanDays = Math.floor((toDayStartUTC(parsedEnd).getTime() - start.getTime()) / 86_400_000) + 1;
    const clampedDays = Math.min(180, Math.max(1, spanDays));
    return { start, end, days: clampedDays };
  }
  return clampDateRange(daysRaw);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (session.user.role !== Role.OWNER && session.user.role !== Role.MANAGER) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!session.user.brandId) {
    return new NextResponse("Brand not found for user", { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const { start, end, days } = resolveDateRange(
    searchParams.get("days"),
    searchParams.get("startDate"),
    searchParams.get("endDate")
  );
  const forceRefresh = searchParams.get("forceRefresh") === "1";
  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);

  const requestedStoreId = searchParams.get("storeId")?.trim() || null;
  const role = session.user.role;
  const scopedStoreId = role === Role.MANAGER ? session.user.storeId : requestedStoreId;

  if (role === Role.MANAGER && !session.user.storeId) {
    return new NextResponse("Store not found for manager", { status: 400 });
  }

  const cacheKey = [
    "analytics-overview",
    session.user.brandId,
    role,
    scopedStoreId ?? "ALL",
    days,
    startKey,
    endKey,
  ].join(":");
  const cached = !forceRefresh ? getCachedAnalytics<any>(cacheKey) : null;
  if (cached) {
    return NextResponse.json(
      {
        ...cached,
        meta: {
          ...(cached.meta ?? {}),
          cacheStatus: "HIT",
          forceRefreshed: false,
        },
      },
      {
      headers: { "x-analytics-cache": "HIT" },
      }
    );
  }

  const storeWhere = {
    brandId: session.user.brandId,
    ...(scopedStoreId ? { id: scopedStoreId } : {}),
  };

  const stores = await prisma.store.findMany({
    where: storeWhere,
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  if (stores.length === 0) {
    return NextResponse.json({
      role,
      range: { start, end, days },
      stores: [],
      selectedStoreId: scopedStoreId,
      summary: {
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        cancelRate: 0,
        overtimeRate: 0,
      },
      charts: {
        peakHours: [],
        topProducts: [],
        topCategories: [],
        paymentMethods: [],
        salesTrend: [],
        staffRanking: [],
        storeComparison: [],
        inventoryBurn: [],
      },
    });
  }

  const loaded = await loadOverviewData({
    brandId: session.user.brandId,
    storeIds: stores.map((s) => s.id),
    stores,
    start,
    end,
    days,
  });
  const metrics = calculateOverviewMetrics(loaded);
  const response = formatOverviewResponse({
    role: role as "OWNER" | "MANAGER",
    range: { start, end, days },
    stores,
    selectedStoreId: scopedStoreId,
    forceRefreshed: forceRefresh,
    metrics,
  });

  setCachedAnalytics(cacheKey, response);
  return NextResponse.json(response, {
    headers: { "x-analytics-cache": "MISS" },
  });
}
