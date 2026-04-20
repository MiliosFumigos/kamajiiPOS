import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLinePayConfig, linePayRequest } from "@/lib/linepay";

type LinePayConfirmResponse = {
  returnCode: string;
  returnMessage: string;
};

function buildKioskRedirect(request: Request, storeId: string, status: string, orderId = "") {
  const origin = new URL(request.url).origin;
  const baseOrigin = (process.env.LINE_PAY_REDIRECT_BASE_URL ?? origin).replace(/\/+$/, "");
  const search = new URLSearchParams({
    storeId,
    linepay: status,
  });
  if (orderId) {
    search.set("orderId", orderId);
  }
  return `${baseOrigin}/kiosk?${search.toString()}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const transactionId = url.searchParams.get("transactionId")?.trim();
  const lineOrderId = url.searchParams.get("orderId")?.trim();
  const storeId = url.searchParams.get("storeId")?.trim() || "";

  if (!transactionId || !lineOrderId || !storeId) {
    return NextResponse.redirect(buildKioskRedirect(request, storeId, "failed"));
  }

  const order = await prisma.order.findUnique({
    where: { id: lineOrderId },
    select: {
      id: true,
      total: true,
      paymentStatus: true,
    },
  });

  if (!order) {
    return NextResponse.redirect(buildKioskRedirect(request, storeId, "failed"));
  }

  if (order.paymentStatus !== "PAID") {
    const { currency } = getLinePayConfig();
    const path = `/v3/payments/${encodeURIComponent(transactionId)}/confirm`;
    try {
      const confirmResult = await linePayRequest<LinePayConfirmResponse>({
        method: "POST",
        requestPath: path,
        body: {
          amount: order.total,
          currency,
        },
      });

      if (confirmResult.returnCode !== "0000") {
        return NextResponse.redirect(
          buildKioskRedirect(request, storeId, "failed", order.id)
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PAID",
        },
      });
    } catch (error) {
      console.error(error);
      return NextResponse.redirect(buildKioskRedirect(request, storeId, "failed", order.id));
    }
  }

  return NextResponse.redirect(buildKioskRedirect(request, storeId, "success", order.id));
}
