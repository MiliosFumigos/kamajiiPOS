import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLinePayConfig, linePayRequest } from "@/lib/linepay";

type Body = {
  orderId?: string;
  storeId?: string;
};

type LinePayRequestResponse = {
  returnCode: string;
  returnMessage: string;
  info?: {
    transactionId: number;
    paymentUrl?: {
      web?: string;
      app?: string;
    };
  };
};

export async function POST(request: Request) {
  let body: Body | null = null;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "請提供 JSON body" }, { status: 400 });
  }

  const orderId = body.orderId?.trim();
  const storeId = body.storeId?.trim();
  if (!orderId) {
    return NextResponse.json({ error: "缺少 orderId" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      displayId: true,
      total: true,
      paymentStatus: true,
      storeId: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: "訂單不存在" }, { status: 404 });
  }
  if (order.paymentStatus === "PAID") {
    return NextResponse.json({ error: "此訂單已付款" }, { status: 409 });
  }

  const { currency } = getLinePayConfig();
  const origin = new URL(request.url).origin;
  const baseOrigin = (process.env.LINE_PAY_REDIRECT_BASE_URL ?? origin).replace(/\/+$/, "");
  const safeStoreId = encodeURIComponent(storeId || order.storeId);

  const confirmUrl = `${baseOrigin}/api/payments/linepay/confirm?storeId=${safeStoreId}`;
  const cancelUrl = `${baseOrigin}/kiosk?storeId=${safeStoreId}&linepay=cancelled`;

  const payload = {
    amount: order.total,
    currency,
    orderId: order.id,
    packages: [
      {
        id: order.id,
        amount: order.total,
        name: `Order ${order.displayId}`,
        products: [
          {
            id: order.id,
            name: `Order ${order.displayId}`,
            quantity: 1,
            price: order.total,
          },
        ],
      },
    ],
    redirectUrls: {
      confirmUrl,
      cancelUrl,
    },
  };

  try {
    const linePayResult = await linePayRequest<LinePayRequestResponse>({
      method: "POST",
      requestPath: "/v3/payments/request",
      body: payload,
    });

    if (linePayResult.returnCode !== "0000") {
      return NextResponse.json(
        {
          error: `LINE Pay request 失敗: ${linePayResult.returnMessage}`,
          returnCode: linePayResult.returnCode,
        },
        { status: 400 }
      );
    }

    const paymentUrl = linePayResult.info?.paymentUrl?.web;
    if (!paymentUrl) {
      return NextResponse.json({ error: "LINE Pay 未回傳付款網址" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      paymentUrl,
      transactionId: linePayResult.info?.transactionId ?? null,
      order: {
        id: order.id,
        displayId: order.displayId,
        total: order.total,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "LINE Pay request 失敗" },
      { status: 500 }
    );
  }
}
