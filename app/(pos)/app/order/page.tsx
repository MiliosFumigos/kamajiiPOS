"use client";

import { useSession } from "next-auth/react";
import { OrderComposer } from "@/components/order/OrderComposer";
import { Card } from "@/components/ui/Card";
import { FullScreenLoading } from "@/components/ui/FullScreenLoading";
import { Role } from "@/lib/types";

export default function AppOrderPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canUseOrder = role === Role.MANAGER || role === Role.STAFF;

  // 固定高度包覆，避免 session 載入前/後切換造成頁面高度位移（CLS）
  return (
    <div className="min-h-[520px] px-2 sm:px-0">
      <FullScreenLoading
        open={status === "loading"}
        title="載入中"
        description="正在確認登入狀態…"
      />
      {status === "loading" ? (
        <Card>
          <div className="space-y-3">
            <div className="h-7 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          </div>
        </Card>
      ) : !canUseOrder ? (
        <Card>
          <p className="text-sm text-slate-600">
            您目前的角色為 {role ?? "未知"}，僅分店長與店員可以使用 POS 點餐。
          </p>
        </Card>
      ) : (
        <OrderComposer
          title="POS 點餐"
          menuEndpoint="/api/menu"
          orderEndpoint="/api/orders"
        />
      )}
    </div>
  );
}

