import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCheckMacValue } from "@/lib/ecpay";

export async function POST(request: Request) {
  const form = await request.formData();
  const entries = Array.from(form.entries()).reduce<Record<string, string>>(
    (acc, [k, v]) => {
      acc[k] = String(v);
      return acc;
    },
    {}
  );

  const receivedMac = (entries.CheckMacValue ?? "").toUpperCase();
  if (!receivedMac) {
    return new NextResponse("0|Missing CheckMacValue");
  }

  const expectedMac = createCheckMacValue(entries);
  if (receivedMac !== expectedMac) {
    return new NextResponse("0|Invalid CheckMacValue");
  }

  const paid =
    entries.RtnCode === "1" &&
    String(entries.SimulatePaid ?? "0") !== "1";

  const orderId = entries.CustomField1?.trim();
  if (!orderId) {
    return new NextResponse("0|Missing CustomField1");
  }

  try {
    if (paid) {
      await prisma.order.updateMany({
        where: { id: orderId, paymentStatus: "UNPAID" as any },
        data: { paymentStatus: "PAID" as any },
      });
    }
    return new NextResponse("1|OK");
  } catch (error) {
    console.error("ECPay callback update failed", error);
    return new NextResponse("0|DB Update Failed");
  }
}
