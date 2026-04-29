"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

export function KioskHeaderOrdersButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    shouldShow,
    tenantPrefix,
    ordersOverviewHref,
    kioskHomeHref,
    mode,
  } = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);

    // browser url examples:
    // - /{brand}/kiosk
    // - /{brand}/kiosk/orders
    // - /{brand}/kiosk/payment-success
    const isKiosk = parts.length >= 2 && parts[1] === "kiosk";
    const isKioskHome = isKiosk && parts.length === 2;
    const isKioskOrders = isKiosk && parts.length >= 3 && parts[2] === "orders";

    const tenant = parts[0];
    const tenantPrefix = tenant ? `/${tenant}` : "";

    const storeId = searchParams.get("storeId") || "";
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    const ordersHref = `${tenantPrefix}/kiosk/orders${qs}`;
    const kioskHref = `${tenantPrefix}/kiosk${qs}`;

    return {
      shouldShow: isKioskHome || isKioskOrders,
      tenantPrefix,
      ordersOverviewHref: ordersHref,
      kioskHomeHref: kioskHref,
      mode: isKioskOrders ? "orders" : "home",
    };
  }, [pathname, searchParams]);

  if (!shouldShow) return null;

  const label = mode === "orders" ? "回到點餐" : "查看訂單總覽";
  const href = mode === "orders" ? kioskHomeHref : ordersOverviewHref;

  return (
    <Link
      href={href}
      className="inline-flex items-center whitespace-nowrap rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50 to-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-brand-800 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:from-brand-100 hover:to-emerald-100 hover:shadow-md sm:px-3 sm:py-2 sm:text-sm"
    >
      {label}
    </Link>
  );
}

