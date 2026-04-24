import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function nextDayUTC(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId")?.trim();
  const orderId = searchParams.get("orderId")?.trim();
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(200, Math.max(1, Math.floor(limitRaw)))
    : 50;

  if (!storeId) {
    return NextResponse.json({ error: "缺少 storeId" }, { status: 400 });
  }

  const now = new Date();
  const where: any = {
    storeId,
    placedAt: {
      gte: startOfDayUTC(now),
      lt: nextDayUTC(now),
    },
  };
  if (orderId) where.id = orderId;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { placedAt: "desc" },
    take: orderId ? 1 : limit,
    include: {
      items: {
        include: {
          customizations: true,
        },
      },
    },
  });

  return NextResponse.json({
    items: orders.map((o) => ({
      id: o.id,
      displayId: (o as any).displayId,
      total: (o as any).total,
      paymentStatus: (o as any).paymentStatus,
      status: (o as any).status,
      placedAt: (o as any).placedAt,
      customerEta: (o as any).customerEta ?? null,
      items: (o as any).items?.map((it: any) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        customizations: (it.customizations ?? []).map((c: any) => ({
          label: c.label,
          quantity: c.quantity,
        })),
      })),
    })),
  });
}
