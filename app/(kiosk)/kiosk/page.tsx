"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { OrderComposer } from "@/components/order/OrderComposer";

export default function KioskPage() {
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId") || "";

  const menuEndpoint = useMemo(() => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    return `/api/public/menu${qs}`;
  }, [storeId]);

  const orderEndpoint = useMemo(() => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    return `/api/orders${qs}`;
  }, [storeId]);

  return (
    <OrderComposer
      title="Kiosk 點餐（免登入）"
      menuEndpoint={menuEndpoint}
      orderEndpoint={orderEndpoint}
    />
  );
}

