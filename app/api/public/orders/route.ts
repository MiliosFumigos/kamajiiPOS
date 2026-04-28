import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkSimpleRateLimit, verifyOptionalSignature } from "@/lib/public-api-security";
import { apiError } from "@/lib/api-error";

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
  const parsed = z
    .object({
      storeId: z.string().trim().min(1),
      orderId: z.string().trim().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      sig: z.string().trim().optional(),
      ts: z.string().trim().optional(),
    })
    .safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return apiError("INVALID_QUERY", "查詢參數格式錯誤", 400, parsed.error.flatten());
  }

  const { storeId, orderId, limit, sig, ts } = parsed.data;

  const rateLimitError = checkSimpleRateLimit({
    request,
    scope: `public-orders:${storeId}`,
    maxRequests: 120,
    windowMs: 60_000,
  });
  if (rateLimitError) return rateLimitError;

  const signatureError = verifyOptionalSignature({
    storeId,
    signature: sig ?? null,
    ts: ts ?? null,
  });
  if (signatureError) return signatureError;

  if (!storeId) return apiError("MISSING_STORE_ID", "缺少 storeId", 400);

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
