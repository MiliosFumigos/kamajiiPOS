"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";

type StoreDetail = {
  store: { id: string; name: string };
  range: { start: string; end: string; days: number };
  summary: { revenue: number; orders: number; cancelRate: number };
  topProducts: { name: string; quantity: number; revenue: number }[];
  recentOrders: {
    id: string;
    displayId: string;
    total: number;
    status: string;
    paymentMethod: "CASH" | "CARD";
    placedAt: string;
    staff: string;
    items: { name: string; quantity: number; unitPrice: number }[];
  }[];
};

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function money(v: number) {
  return `$${v.toLocaleString("zh-TW")}`;
}

export default function StoreDrillDownPage() {
  const params = useParams<{ storeId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const daysRaw = Number(searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysRaw) ? Math.min(180, Math.max(7, Math.floor(daysRaw))) : 30;

  const [data, setData] = useState<StoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          storeId: params.storeId,
          days: String(days),
        });
        const res = await fetch(`/api/analytics/store-detail?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("讀取分店明細失敗");
        const json = (await res.json()) as StoreDetail;
        setData(json);
      } catch (e) {
        console.error(e);
        setError("無法載入分店明細。");
      } finally {
        setLoading(false);
      }
    };
    void fetchDetail();
  }, [days, params.storeId]);

  const title = useMemo(() => {
    if (!data) return "分店明細";
    return `${data.store.name} 明細`;
  }, [data]);

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-500">載入分店明細中...</p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <p className="text-sm text-red-600">{error ?? "無資料"}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">近 {data.range.days} 天營運明細</p>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 sm:w-auto"
          >
            返回 Dashboard
          </button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card title="營收">
          <p className="text-xl font-semibold text-slate-900">{money(data.summary.revenue)}</p>
        </Card>
        <Card title="訂單數">
          <p className="text-xl font-semibold text-slate-900">{data.summary.orders}</p>
        </Card>
        <Card title="取消率">
          <p className="text-xl font-semibold text-rose-700">{pct(data.summary.cancelRate)}</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Top 商品">
          <div className="space-y-2">
            {data.topProducts.map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                className="rounded border border-slate-100 px-2 py-1.5 text-sm"
              >
                <p className="truncate text-slate-700">{idx + 1}. {item.name}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-900 sm:text-sm">
                  銷量 {item.quantity} / 營收 {money(item.revenue)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="近期訂單（80 筆）">
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {data.recentOrders.map((order) => (
              <div key={order.id} className="rounded border border-slate-100 px-2 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{order.displayId}</span>
                  <span className="text-slate-600">{money(order.total)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {new Date(order.placedAt).toLocaleString("zh-TW")} · {order.staff} ·{" "}
                  {order.paymentMethod === "CARD" ? "信用卡" : "現金"}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
