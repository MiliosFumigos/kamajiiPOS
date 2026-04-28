import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { buildEcpayCheckoutPayload, getEcpayCheckoutAction } from "@/lib/ecpay";
import { z } from "zod";
import { apiError } from "@/lib/api-error";

type CreateOrderBody = {
  checkoutContext?: "POS" | "KIOSK";
  paymentMethod?: "CASH" | "CARD";
  items: {
    menuItemId: string;
    quantity: number;
    customizations?: { customizationId: string; quantity: number }[];
  }[];
};

const createOrderSchema = z.object({
  checkoutContext: z.enum(["POS", "KIOSK"]).optional(),
  paymentMethod: z.enum(["CASH", "CARD"]).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().trim().min(1),
        quantity: z.coerce.number().int().positive(),
        customizations: z
          .array(
            z.object({
              customizationId: z.string().trim().min(1),
              quantity: z.coerce.number().int().positive(),
            })
          )
          .optional(),
      })
    )
    .min(1),
});

const listOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  date: z.string().trim().optional(),
});

const patchOrderSchema = z
  .object({
    orderId: z.string().trim().min(1),
    status: z
      .enum(["QUEUED", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"])
      .optional(),
    paymentStatus: z.enum(["UNPAID", "PAID"]).optional(),
  })
  .refine((v) => Boolean(v.status || v.paymentStatus), {
    message: "請至少提供 status 或 paymentStatus 其中一項",
  });

class ApiConflictError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 409, details?: unknown) {
    super(message);
    this.name = "ApiConflictError";
    this.status = status;
    this.details = details;
  }
}

const ALLOWED_STATUSES = [
  "QUEUED",
  "IN_PROGRESS",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
] as const;

const ALLOWED_PAYMENT_STATUSES = ["UNPAID", "PAID"] as const;

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function nextDayUTC(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  );
}

function yyyymmddUTC(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function parseYyyymmddToUTC(dateStr: string): { start: Date; end: Date } | null {
  if (!/^\d{8}$/.test(dateStr)) return null;
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6));
  const day = Number(dateStr.slice(6, 8));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(year, month - 1, day + 1));
  return { start, end };
}

function resolveClientBackUrl(request: Request): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const candidate = new URL(referer);
    const requestOrigin = new URL(request.url).origin;
    if (candidate.origin !== requestOrigin) return null;
    return candidate.toString();
  } catch {
    return null;
  }
}

function resolveTenantPrefixFromReferer(request: Request): string {
  const referer = request.headers.get("referer");
  if (!referer) return "";
  try {
    const refererUrl = new URL(referer);
    const requestOrigin = new URL(request.url).origin;
    if (refererUrl.origin !== requestOrigin) return "";
    const parts = refererUrl.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[1] === "kiosk") {
      return `/${parts[0]}`;
    }
    return "";
  } catch {
    return "";
  }
}

function getCheckoutClientBackUrl(
  request: Request,
  storeId: string,
  orderId: string,
  checkoutContext: "POS" | "KIOSK"
): string {
  const origin = new URL(request.url).origin;
  if (checkoutContext === "KIOSK") {
    const tenantPrefix = resolveTenantPrefixFromReferer(request);
    return `${origin}${tenantPrefix}/kiosk/payment-success?storeId=${encodeURIComponent(
      storeId
    )}&orderId=${encodeURIComponent(orderId)}`;
  }
  return `${origin}/app/order?payment=success&orderId=${encodeURIComponent(orderId)}`;
}

function computeTotalPrepById(orders: any[]): Map<string, number> {
  const totalPrepById = new Map<string, number>();
  for (const o of orders) {
    const totalPrep =
      o.items?.reduce(
        (acc: number, it: any) =>
          acc +
          Math.max(0, Number(it.prepMinutes ?? 0)) * Math.max(0, Number(it.quantity ?? 0)),
        0
      ) ?? 0;
    totalPrepById.set(o.id, totalPrep);
  }
  return totalPrepById;
}

function computeStaffEtaById(
  orders: any[],
  totalPrepById: Map<string, number>,
  now: Date
): Map<string, Date> {
  // 以分鐘為粒度做時間錨點，避免「封存瞬間」與「畫面重算瞬間」因秒數差異而導致分鐘顯示跳動
  const anchorNow = new Date(now.getTime());
  anchorNow.setSeconds(0, 0);

  // 店員動態 ETA：把 IN_PROGRESS 視為「已在產線上」，先照 startedAt 依序排，
  // 接著再把 QUEUED 視為下一批照 placedAt 依序排。
  const staffEtaById = new Map<string, Date>();
  const activeOrders = orders.filter(
    (o) => o.status === "IN_PROGRESS" || o.status === "QUEUED"
  );

  const inProgressOrders = activeOrders
    .filter((o) => o.status === "IN_PROGRESS")
    .sort(
      (a, b) =>
        (a.startedAt ? a.startedAt.getTime() : 0) -
        (b.startedAt ? b.startedAt.getTime() : 0)
    );

  const queuedOrders = activeOrders
    .filter((o) => o.status === "QUEUED")
    .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());

  let lineFreeAt = new Date(anchorNow.getTime());

  for (const o of inProgressOrders) {
    const startedAt = (o.startedAt as Date | null) ?? null;
    const totalPrep = totalPrepById.get(o.id) ?? 0;

    const elapsedMinutes =
      startedAt != null
        ? Math.max(
            0,
            Math.floor((anchorNow.getTime() - startedAt.getTime()) / 60_000)
          )
        : 0;
    const remaining = Math.max(0, totalPrep - elapsedMinutes);
    const eta = new Date(lineFreeAt.getTime() + remaining * 60_000);
    lineFreeAt = eta;
    staffEtaById.set(o.id, eta);
  }

  for (const o of queuedOrders) {
    const totalPrep = totalPrepById.get(o.id) ?? 0;
    const eta = new Date(lineFreeAt.getTime() + totalPrep * 60_000);
    lineFreeAt = eta;
    staffEtaById.set(o.id, eta);
  }

  return staffEtaById;
}

async function resolveBrandAndStore(request: Request): Promise<{
  brandId: string;
  storeId: string;
  actorUserId: string | null;
}> {
  const session = await getServerSession(authOptions);

  // POS（有登入）
  if (session?.user?.id) {
    if (session.user.role !== Role.MANAGER && session.user.role !== Role.STAFF) {
      throw new Error("Forbidden");
    }

    const brandId = session.user.brandId;
    if (!brandId) throw new Error("Brand not found for user");

    const storeId = session.user.storeId;
    if (!storeId) throw new Error("Store not found for user");

    const store = await prisma.store.findFirst({
      where: { id: storeId, brandId },
      select: { id: true },
    });
    if (!store) throw new Error("Store not found for user");

    return { brandId, storeId: store.id, actorUserId: session.user.id };
  }

  // Kiosk（免登入）：path-based 多租戶下，依 storeId 解析 brand/store
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId")?.trim();
  if (!storeId) throw new Error("Missing storeId");

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, brandId: true },
  });
  if (!store) throw new Error("Store not found");

  return { brandId: store.brandId, storeId: store.id, actorUserId: null };
}

/**
 * 建立訂單（POS / Kiosk 共用）
 * POST /api/orders
 */
export async function POST(request: Request) {
  let body: CreateOrderBody | null = null;
  try {
    body = (await request.json()) as CreateOrderBody;
  } catch {
    return apiError("INVALID_JSON", "請提供 JSON body", 400);
  }

  const parsedBody = createOrderSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError("INVALID_ORDER_PAYLOAD", "訂單參數格式錯誤", 400, parsedBody.error.flatten());
  }
  const itemsInput = parsedBody.data.items;
  const checkoutContext = parsedBody.data.checkoutContext === "KIOSK" ? "KIOSK" : "POS";
  const paymentMethod = parsedBody.data.paymentMethod === "CARD" ? "CARD" : "CASH";

  let brandId = "";
  let storeId = "";
  let actorUserId: string | null = null;
  try {
    ({ brandId, storeId, actorUserId } = await resolveBrandAndStore(request));
  } catch (e) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const now = new Date();
  const dayStart = startOfDayUTC(now);
  const dayEnd = nextDayUTC(now);
  const dayKey = yyyymmddUTC(now);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1) 拉取菜單品項（含 recipe / customizations）
      const menuItemIds = Array.from(
        new Set(itemsInput.map((i) => i.menuItemId).filter(Boolean))
      );
      const menuItems = await tx.menuItem.findMany({
        where: { brandId, storeId, id: { in: menuItemIds }, isActive: true },
        include: {
          recipeLines: { select: { ingredientId: true, quantity: true } },
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
      });
      const menuMap = new Map(menuItems.map((m) => [m.id, m]));

      // 2) 驗證輸入與 dailyLimit（一次聚合查詢，避免 N 次 aggregate）
      const requestedQtyByMenuId = new Map<string, number>();
      for (const input of itemsInput) {
        const qty = Number.isFinite(input.quantity)
          ? Math.max(0, Math.floor(input.quantity))
          : 0;
        if (!input.menuItemId || qty <= 0) {
          throw new Error("商品與數量不正確");
        }
        const menu = menuMap.get(input.menuItemId);
        if (!menu) {
          throw new Error("菜單品項不存在或已停用");
        }
        requestedQtyByMenuId.set(
          menu.id,
          (requestedQtyByMenuId.get(menu.id) ?? 0) + qty
        );
      }
      const soldRows =
        menuItemIds.length > 0
          ? await tx.orderItem.groupBy({
              by: ["menuItemId"],
              where: {
                menuItemId: { in: menuItemIds },
                order: {
                  storeId,
                  placedAt: { gte: dayStart, lt: dayEnd },
                  status: { not: "CANCELLED" as any },
                },
              },
              _sum: { quantity: true },
            })
          : [];
      const soldByMenuId = new Map(
        soldRows.map((row) => [row.menuItemId, row._sum.quantity ?? 0])
      );
      for (const [menuId, requestedQty] of Array.from(requestedQtyByMenuId.entries())) {
        const menu = menuMap.get(menuId);
        if (!menu) continue;
        const sold = soldByMenuId.get(menuId) ?? 0;
        if (sold + requestedQty > menu.dailyLimit) {
          const remaining = Math.max(0, menu.dailyLimit - sold);
          return {
            ok: false as const,
            code: 409,
            error: `「${menu.name}」今日剩餘 ${remaining} 份，無法再下單 ${requestedQty} 份`,
          };
        }
      }

      // 3) 依 recipe + 客製化額外用量 聚合需要扣的原料數量
      const requiredByIngredient = new Map<string, number>();
      for (const input of itemsInput) {
        const menu = menuMap.get(input.menuItemId);
        if (!menu) continue;
        const qty = Math.max(0, Math.floor(input.quantity || 0));
        // 基礎商品配方
        for (const line of menu.recipeLines) {
          const need = line.quantity * qty;
          requiredByIngredient.set(
            line.ingredientId,
            (requiredByIngredient.get(line.ingredientId) || 0) + need
          );
        }
        // 客製化額外配方
        const chosen = (input.customizations ?? [])
          .map((c) => ({
            customizationId: c.customizationId,
            quantity: Number.isFinite(c.quantity)
              ? Math.max(0, Math.floor(c.quantity))
              : 0,
          }))
          .filter((c) => c.customizationId && c.quantity > 0);
        const customizationById = new Map(menu.customizations.map((c) => [c.id, c]));
        for (const c of chosen) {
          const opt = customizationById.get(c.customizationId);
          if (!opt) continue;
          const perUnitQty = Math.min(c.quantity, opt.maxQuantity);
          if (perUnitQty <= 0) continue;
          for (const line of opt.extraRecipeLines) {
            const extraNeed = line.quantity * qty * perUnitQty;
            requiredByIngredient.set(
              line.ingredientId,
              (requiredByIngredient.get(line.ingredientId) || 0) + extraNeed
            );
          }
        }
      }

      // 4) 扣庫存（先一次檢查，再條件扣減；若競態失敗直接 rollback）
      const ingredientIds = Array.from(requiredByIngredient.keys());
      const inventoryRows =
        ingredientIds.length > 0
          ? await tx.inventory.findMany({
              where: { brandId, storeId, ingredientId: { in: ingredientIds } },
              select: { ingredientId: true, quantity: true },
            })
          : [];
      const availableByIngredientId = new Map(
        inventoryRows.map((row) => [row.ingredientId, row.quantity])
      );
      const insufficient: { ingredientId: string; needed: number; available: number }[] = [];
      for (const [ingredientId, needed] of Array.from(requiredByIngredient.entries())) {
        if (needed <= 0) continue;
        const available = availableByIngredientId.get(ingredientId) ?? 0;
        if (available < needed) {
          insufficient.push({ ingredientId, needed, available });
        }
      }
      if (insufficient.length > 0) {
        const ingredients = await tx.ingredient.findMany({
          where: { id: { in: insufficient.map((i) => i.ingredientId) } },
          select: { id: true, name: true, unit: true },
        });
        const ingMap = new Map(ingredients.map((i) => [i.id, i]));
        return {
          ok: false as const,
          code: 409,
          error: "庫存不足",
          details: insufficient.map((x) => ({
            ingredientId: x.ingredientId,
            name: ingMap.get(x.ingredientId)?.name ?? "未知原料",
            unit: ingMap.get(x.ingredientId)?.unit ?? "",
            needed: x.needed,
            available: x.available,
          })),
        };
      }
      for (const [ingredientId, needed] of Array.from(requiredByIngredient.entries())) {
        if (needed <= 0) continue;
        const updated = await tx.inventory.updateMany({
          where: {
            brandId,
            storeId,
            ingredientId,
            quantity: { gte: needed },
          },
          data: { quantity: { decrement: needed } },
        });
        if (updated.count !== 1) {
          throw new ApiConflictError("庫存在下單過程中變動，請重試", 409);
        }
      }

      // 5) 取得/遞增每日流水號 → displayId（延後到可建立訂單前，減少無效遞增）
      const counter = await tx.orderCounter.upsert({
        where: { storeId_date: { storeId, date: dayStart } },
        update: { seq: { increment: 1 } },
        create: { storeId, date: dayStart, seq: 1 },
        select: { seq: true },
      });
      const displayId = `ORD-${dayKey}-${String(counter.seq).padStart(4, "0")}`;

      // 6) 建立訂單與明細（快照）
      const createdOrder = await tx.order.create({
        data: {
          brandId,
          storeId,
          displayId,
          // 新訂單：尚未付款、但進入製作流程
          paymentStatus: "UNPAID" as any,
          paymentMethod: paymentMethod as any,
          status: "QUEUED" as any,
          createdByUserId: actorUserId,
          total: 0,
          placedAt: now,
        } as any,
        select: {
          id: true,
          displayId: true,
          placedAt: true,
          paymentStatus: true,
          status: true,
          startedAt: true,
          readyAt: true,
        },
      });

      let total = 0;

      for (const input of itemsInput) {
        const menu = menuMap.get(input.menuItemId);
        if (!menu) continue;
        const qty = Math.max(0, Math.floor(input.quantity || 0));
        if (qty <= 0) continue;

        const chosen = (input.customizations ?? [])
          .map((c) => ({
            customizationId: c.customizationId,
            quantity: Number.isFinite(c.quantity) ? Math.max(0, Math.floor(c.quantity)) : 0,
          }))
          .filter((c) => c.customizationId && c.quantity > 0);

        const customizationById = new Map(menu.customizations.map((c) => [c.id, c]));
        const snapshotCustomizations: { label: string; priceDelta: number; quantity: number }[] =
          [];

        let perItemDelta = 0;
        for (const c of chosen) {
          const opt = customizationById.get(c.customizationId);
          if (!opt) continue;
          const q = Math.min(c.quantity, opt.maxQuantity);
          if (q <= 0) continue;
          snapshotCustomizations.push({
            label: opt.label,
            priceDelta: opt.priceDelta,
            quantity: q,
          });
          perItemDelta += opt.priceDelta * q;
        }

        const lineTotal = (menu.price + perItemDelta) * qty;
        total += lineTotal;

        const orderItem = await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            menuItemId: menu.id,
            name: menu.name,
            imageUrl: menu.imageUrl,
            unitPrice: menu.price,
            prepMinutes: menu.prepMinutes,
            quantity: qty,
          } as any,
          select: { id: true },
        });

        if (snapshotCustomizations.length > 0) {
          await tx.orderItemCustomization.createMany({
            data: snapshotCustomizations.map((c) => ({
              orderItemId: orderItem.id,
              label: c.label,
              priceDelta: c.priceDelta,
              quantity: c.quantity,
            })),
          });
        }
      }

      await tx.order.update({
        where: { id: createdOrder.id },
        data: { total },
      });

      // 封存客人固定看的 ETA：當訂單進入 QUEUED 時計算一次
      const activeForCustomerEta = await tx.order.findMany({
        where: {
          brandId,
          storeId,
          // 與 KDS 的 date=today 行為對齊：只考量當日訂單（UTC）
          placedAt: {
            gte: dayStart,
            lt: dayEnd,
          },
          status: { in: ["IN_PROGRESS", "QUEUED"] as any },
        },
        include: {
          items: { select: { prepMinutes: true, quantity: true } },
        },
      });

      const totalPrepByIdForCustomer = computeTotalPrepById(
        activeForCustomerEta as any[]
      );
      const staffEtaByIdForCustomer = computeStaffEtaById(
        activeForCustomerEta as any[],
        totalPrepByIdForCustomer,
        now
      );

      await tx.order.update({
        where: { id: createdOrder.id },
        data: {
          customerEta: staffEtaByIdForCustomer.get(createdOrder.id) ?? null,
        },
      });

      return {
        ok: true as const,
        order: {
          id: createdOrder.id,
          displayId: createdOrder.displayId,
          placedAt: createdOrder.placedAt,
          total,
          paymentStatus: "UNPAID",
          paymentMethod,
          status: createdOrder.status,
        },
        paymentMethod,
      };
    });

    if (!result.ok) {
      return NextResponse.json(
        { code: "ORDER_CONFLICT", message: result.error, details: (result as any).details ?? undefined },
        { status: result.code }
      );
    }

    if (paymentMethod === "CARD") {
      const baseUrl =
        process.env.ECPAY_BASE_URL?.trim() ||
        process.env.NEXTAUTH_URL?.trim() ||
        "http://localhost:3000";
      const fallbackClientBackUrl = getCheckoutClientBackUrl(
        request,
        storeId,
        result.order.id,
        checkoutContext
      );
      const clientBackUrl =
        checkoutContext === "KIOSK"
          ? fallbackClientBackUrl
          : resolveClientBackUrl(request) || fallbackClientBackUrl;
      const merchantTradeNo = `${result.order.displayId.replace(/[^A-Za-z0-9]/g, "").slice(0, 14)}${result.order.id.replace(/[^A-Za-z0-9]/g, "").slice(-6)}`;
      const payload = buildEcpayCheckoutPayload({
        merchantTradeNo,
        merchantTradeDate: new Date(),
        totalAmount: result.order.total,
        tradeDesc: "POS Order Payment",
        itemName: `${result.order.displayId}#${result.order.total}元`,
        returnUrl: `${baseUrl}/api/payments/ecpay/callback`,
        clientBackUrl,
        customField1: result.order.id,
      });

      return NextResponse.json({
        ...result,
        payment: {
          provider: "ECPAY",
          action: getEcpayCheckoutAction(),
          method: "POST",
          fields: payload,
        },
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ApiConflictError) {
      return NextResponse.json(
        { code: "ORDER_CONFLICT", message: e.message, details: e.details ?? undefined },
        { status: e.status }
      );
    }
    console.error(e);
    return apiError("ORDER_CREATE_FAILED", e instanceof Error ? e.message : "建立訂單失敗", 500);
  }
}

/**
 * 讀取訂單（POS 後台用，需要登入）
 * GET /api/orders?limit=50
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401);
  }

  if (session.user.role !== Role.MANAGER && session.user.role !== Role.STAFF) {
    return apiError("FORBIDDEN", "Forbidden", 403);
  }

  const brandId = session.user.brandId;
  if (!brandId) {
    return apiError("BRAND_NOT_FOUND", "Brand not found for user", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { storeId: true },
  });

  const storeId =
    user?.storeId ??
    (await prisma.store.findFirst({
      where: { brandId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }))?.id;

  if (!storeId) {
    return apiError("STORE_NOT_FOUND", "Store not found for brand", 400);
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = listOrdersQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsedQuery.success) {
    return apiError("INVALID_QUERY", "查詢參數格式錯誤", 400, parsedQuery.error.flatten());
  }
  const { limit, date: dateParam } = parsedQuery.data;

  let dateFilter:
    | {
        gte: Date;
        lt: Date;
      }
    | undefined;

  if (dateParam === "today") {
    const now = new Date();
    const start = startOfDayUTC(now);
    const end = nextDayUTC(now);
    dateFilter = { gte: start, lt: end };
  } else if (dateParam) {
    const parsed = parseYyyymmddToUTC(dateParam);
    if (parsed) {
      dateFilter = { gte: parsed.start, lt: parsed.end };
    }
  }

  const orders = await prisma.order.findMany({
    where: {
      brandId,
      storeId,
      ...(dateFilter
        ? {
            placedAt: dateFilter,
          }
        : {}),
    },
    orderBy: { placedAt: "desc" },
    take: limit,
    include: {
      items: {
        include: { customizations: true },
      },
    },
  });

  const dateKeysSet = new Set<string>();
  for (const o of orders) {
    dateKeysSet.add(yyyymmddUTC(o.placedAt));
  }
  const dates = Array.from(dateKeysSet).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  const now = new Date();
  const totalPrepById = computeTotalPrepById(orders);

  // staffEta：考量「插隊」造成的狀態變更，動態重算
  const staffEtaById = computeStaffEtaById(orders, totalPrepById, now);

  return NextResponse.json({
    items: orders.map((o) => {
      const totalPrep = totalPrepById.get(o.id) ?? 0;
      const customerEta =
        (o as any).customerEta ?? staffEtaById.get(o.id) ?? null;
      const staffEta = staffEtaById.get(o.id) ?? null;
      return {
        id: o.id,
        displayId: (o as any).displayId,
        total: (o as any).total,
        // 新欄位：付款狀態
        paymentStatus: (o as any).paymentStatus ?? "UNPAID",
        paymentMethod: (o as any).paymentMethod ?? "CASH",
        // 製作狀態
        status: (o as any).status,
        placedAt: (o as any).placedAt,
        startedAt: (o as any).startedAt ?? null,
        readyAt: (o as any).readyAt ?? null,
        totalPrepMinutes: totalPrep,
        // 給客人的「起始預估」時間（封存欄位）
        customerEta,
        // 給店員的「動態預估」時間（每次 GET 重算）
        staffEta,
        // 兼容舊欄位：沿用 staffEta 的值
        eta: staffEta,
        items: (o as any).items?.map((it: any) => ({
          id: it.id,
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          prepMinutes: it.prepMinutes ?? 0,
          customizations: it.customizations?.map((c: any) => ({
            label: c.label,
            priceDelta: c.priceDelta,
            quantity: c.quantity,
          })),
        })),
      };
    }),
    dates,
  });
}

/**
 * 更新訂單狀態（POS 後台用，需要登入）
 * PATCH /api/orders
 */
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError("UNAUTHORIZED", "Unauthorized", 401);
  }

  if (session.user.role !== Role.MANAGER && session.user.role !== Role.STAFF) {
    return apiError("FORBIDDEN", "Forbidden", 403);
  }

  const brandId = session.user.brandId;
  if (!brandId) {
    return apiError("BRAND_NOT_FOUND", "Brand not found for user", 400);
  }

  let body: { orderId?: string; status?: string; paymentStatus?: string } | null = null;
  try {
    body = (await request.json()) as {
      orderId?: string;
      status?: string;
      paymentStatus?: string;
    };
  } catch {
    return apiError("INVALID_JSON", "請提供 JSON body", 400);
  }

  const parsedBody = patchOrderSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError("INVALID_PATCH_PAYLOAD", "更新參數格式錯誤", 400, parsedBody.error.flatten());
  }
  const { orderId, status, paymentStatus } = parsedBody.data;

  if (status && !ALLOWED_STATUSES.includes(status as any)) {
    return apiError("INVALID_STATUS", "不支援的訂單狀態", 400);
  }

  if (paymentStatus && !ALLOWED_PAYMENT_STATUSES.includes(paymentStatus as any)) {
    return apiError("INVALID_PAYMENT_STATUS", "不支援的付款狀態", 400);
  }

  const storeId = session.user.storeId;
  if (!storeId) {
    return apiError("STORE_NOT_FOUND", "Store not found for user", 400);
  }

  const scopedOrderWhere = { id: orderId, brandId, storeId };

  const order = await prisma.order.findFirst({
    where: scopedOrderWhere,
    select: {
      id: true,
      storeId: true,
      status: true,
      startedAt: true,
      readyAt: true,
      customerEta: true,
      placedAt: true,
    },
  });
  if (!order) {
    return apiError("ORDER_NOT_FOUND", "找不到訂單", 404);
  }

  const nextStatus = status ?? undefined;
  const now = new Date();

  const data: any = {
    ...(paymentStatus ? { paymentStatus: paymentStatus as any } : {}),
  };

  if (nextStatus) {
    data.status = nextStatus as any;
    // 進入製作中：補上 startedAt（只在第一次進入時寫入）
    if (nextStatus === "IN_PROGRESS" && !order.startedAt) {
      data.startedAt = now;
    }
    // 進入待取貨：補上 readyAt
    if (nextStatus === "READY_FOR_PICKUP" && !order.readyAt) {
      data.readyAt = now;
    }
    // 回到排隊：清掉 startedAt/readyAt（避免顯示錯誤 ETA）
    if (nextStatus === "QUEUED") {
      data.startedAt = null;
      data.readyAt = null;
    }
    // 取消：保留 startedAt/readyAt（可做統計）；不特別清掉
    if (nextStatus === "COMPLETED") {
      data.completedByUserId = session.user.id;
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data,
  });

  // 當店員把單「推回」QUEUED 時，重新封存客人固定看的 ETA
  if (nextStatus === "QUEUED" && !order.customerEta) {
    const dayStartForEta = startOfDayUTC(order.placedAt);
    const dayEndForEta = nextDayUTC(order.placedAt);

    const activeForCustomerEta = await prisma.order.findMany({
      where: {
        brandId,
        storeId: order.storeId,
        // 與 KDS 的 date=today 行為對齊：只考量當日訂單（UTC）
        placedAt: {
          gte: dayStartForEta,
          lt: dayEndForEta,
        },
        status: { in: ["IN_PROGRESS", "QUEUED"] as any },
      },
      include: {
        items: { select: { prepMinutes: true, quantity: true } },
      },
    });

    const totalPrepByIdForCustomer = computeTotalPrepById(
      activeForCustomerEta as any[]
    );
    const staffEtaByIdForCustomer = computeStaffEtaById(
      activeForCustomerEta as any[],
      totalPrepByIdForCustomer,
      now
    );

    await prisma.order.update({
      where: { id: order.id },
      data: { customerEta: staffEtaByIdForCustomer.get(order.id) ?? null },
    });
  }

  const updated = await prisma.order.findFirst({
    where: { id: order.id, brandId, storeId },
    select: {
      id: true,
      displayId: true,
      total: true,
      paymentStatus: true,
      paymentMethod: true,
      status: true,
      placedAt: true,
      startedAt: true,
      readyAt: true,
      customerEta: true,
      items: {
        select: {
          id: true,
          name: true,
          unitPrice: true,
          quantity: true,
          prepMinutes: true,
          customizations: {
            select: { label: true, priceDelta: true, quantity: true },
          },
        },
      },
    },
  });

  if (!updated) {
    return NextResponse.json({ ok: true });
  }

  const totalPrepMinutes =
    updated.items?.reduce(
      (acc, it) =>
        acc +
        Math.max(0, Number(it.prepMinutes ?? 0)) * Math.max(0, Number(it.quantity ?? 0)),
      0
    ) ?? 0;

  return NextResponse.json({
    ok: true,
    order: {
      ...updated,
      totalPrepMinutes,
    },
  });
}

