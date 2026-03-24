"use client";

import { useSession } from "next-auth/react";
import { OrderComposer } from "@/components/order/OrderComposer";
import { Card } from "@/components/ui/Card";
import { Role } from "@/lib/types";

export default function AppOrderPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canUseOrder = role === Role.MANAGER || role === Role.STAFF;

  if (!canUseOrder) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          您目前的角色為 {role ?? "未知"}，僅分店長與店員可以使用 POS 點餐。
        </p>
      </Card>
    );
  }

  return (
    <OrderComposer
      title="POS 點餐"
      menuEndpoint="/api/menu"
      orderEndpoint="/api/orders"
    />
  );
}

