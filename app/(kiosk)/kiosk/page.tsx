"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { OrderComposer } from "@/components/order/OrderComposer";

export default function KioskPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId") || "";
  const tenantPrefix = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[1] === "kiosk") {
      return `/${parts[0]}`;
    }
    return "";
  }, [pathname]);

  const menuEndpoint = useMemo(() => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    return `/api/public/menu${qs}`;
  }, [storeId]);

  const orderEndpoint = useMemo(() => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    return `/api/orders${qs}`;
  }, [storeId]);

  const ordersOverviewHref = useMemo(() => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    return `${tenantPrefix}/kiosk/orders${qs}`;
  }, [storeId, tenantPrefix]);

  return (
    <div className="space-y-4">
      <OrderComposer
        title="Kiosk 點餐（免登入）"
        menuEndpoint={menuEndpoint}
        orderEndpoint={orderEndpoint}
        showLatestOrderSummary={false}
        categoryFilterSidebar
        checkoutContext="KIOSK"
      />
    </div>
  );
}

