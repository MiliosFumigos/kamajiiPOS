"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";

type Order = {
  id: string;
  displayId: string;
  total: number;
  paymentStatus: "UNPAID" | "PAID";
  status: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    customizations: { label: string; quantity: number }[];
  }[];
};

const statusLabels: Record<string, string> = {
  QUEUED: "待開始",
  IN_PROGRESS: "製作中",
  READY_FOR_PICKUP: "待取貨",
  COMPLETED: "完成",
  CANCELLED: "已取消",
};

export default function KioskPaymentSuccessPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const storeId = searchParams.get("storeId")?.trim() ?? "";
  const orderId = searchParams.get("orderId")?.trim() ?? "";
  const tenantPrefix = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[1] === "kiosk") {
      return `/${parts[0]}`;
    }
    return "";
  }, [pathname]);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(10);

  const overviewHref = useMemo(() => {
    if (!storeId) return `${tenantPrefix}/kiosk/orders`;
    return `${tenantPrefix}/kiosk/orders?storeId=${encodeURIComponent(storeId)}`;
  }, [storeId, tenantPrefix]);
  const kioskHomeHref = useMemo(() => {
    if (!storeId) return `${tenantPrefix}/kiosk`;
    return `${tenantPrefix}/kiosk?storeId=${encodeURIComponent(storeId)}`;
  }, [storeId, tenantPrefix]);

  useEffect(() => {
    if (!storeId || !orderId) {
      setError("缺少訂單資訊，請回到點餐頁重試。");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/public/orders?storeId=${encodeURIComponent(storeId)}&orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("找不到訂單");
        const data = (await res.json()) as { items: Order[] };
        const found = data.items?.[0];
        if (!found) throw new Error("找不到訂單");
        setOrder(found);
      } catch (e) {
        console.error(e);
        setError("無法載入訂單資料，請洽現場服務人員。");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [storeId, orderId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          router.replace(overviewHref);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [overviewHref, router]);

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4">
      <Card>
        <div className="mx-auto w-full max-w-3xl space-y-3 text-center">
          <h2 className="text-xl font-semibold text-emerald-700">刷卡成功，訂單成立</h2>
          <p className="mx-auto max-w-xl text-sm leading-6 text-slate-600">
            感謝您的訂購，系統會在 {seconds} 秒後自動帶您前往「訂單總覽」頁面。
          </p>
          <div className="mx-auto h-1.5 w-full max-w-md overflow-hidden rounded-full bg-neutral-200">
            <div className="loading-bar h-full w-1/2 rounded-full bg-amber-500" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Link
              href={kioskHomeHref}
              className="inline-flex items-center rounded-lg border border-brand-200 bg-gradient-to-r from-brand-50 to-emerald-50 px-3 py-2 text-sm font-medium text-brand-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:from-brand-100 hover:to-emerald-100 hover:shadow-md"
            >
              回到菜單
            </Link>
            <Link
              href={overviewHref}
              className="inline-flex items-center rounded-lg border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2 text-sm font-medium text-sky-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:from-sky-100 hover:to-cyan-100 hover:shadow-md"
            >
              訂單總覽
            </Link>
          </div>
        </div>
      </Card>
      <style jsx>{`
        .loading-bar {
          animation: loadingBar 1.2s infinite ease-in-out;
          will-change: transform;
        }

        @keyframes loadingBar {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(220%);
          }
        }
      `}</style>

      <Card title="本次訂單">
        {loading ? (
          <p className="mx-auto w-full max-w-3xl text-center text-sm text-slate-500">
            載入中...
          </p>
        ) : error ? (
          <p className="mx-auto w-full max-w-3xl text-center text-sm text-red-600">
            {error}
          </p>
        ) : !order ? (
          <p className="mx-auto w-full max-w-3xl text-center text-sm text-slate-500">
            查無訂單資料
          </p>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-base font-semibold tracking-wide text-slate-900">
                {order.displayId}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                狀態：{statusLabels[order.status] ?? order.status} | 付款：
                {order.paymentStatus === "PAID" ? "已付款" : "未付款"}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                總金額：${order.total}
              </p>
            </div>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-center"
                >
                  <p className="text-sm font-medium leading-6 text-slate-900">
                    {item.name} x{item.quantity}
                  </p>
                  {item.customizations.length > 0 && (
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      客製：
                      {item.customizations
                        .map((c) => `${c.label}x${c.quantity}`)
                        .join("、")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
