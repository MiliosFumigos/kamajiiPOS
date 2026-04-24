"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";

type Order = {
  id: string;
  displayId: string;
  total: number;
  status: string;
  paymentStatus: "UNPAID" | "PAID";
  placedAt: string;
  customerEta?: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    customizations: { label: string; quantity: number }[];
  }[];
};

type SectionKey = "queued" | "inProgress" | "ready";

const statusLabels: Record<string, string> = {
  QUEUED: "待開始",
  IN_PROGRESS: "製作中",
  READY_FOR_PICKUP: "待取貨",
  COMPLETED: "完成",
  CANCELLED: "已取消",
};

const orderStatusSummaryStyles: Record<
  string,
  { container: string; badge: string }
> = {
  QUEUED: {
    container: "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50",
    badge: "bg-amber-100 text-amber-800",
  },
  IN_PROGRESS: {
    container: "border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50",
    badge: "bg-sky-100 text-sky-800",
  },
  READY_FOR_PICKUP: {
    container: "border-brand-200 bg-gradient-to-r from-brand-50 to-emerald-50",
    badge: "bg-brand-100 text-brand-800",
  },
};

const sectionStyles: Record<
  SectionKey,
  {
    header: string;
    badge: string;
    chevron: string;
    emptyText: string;
  }
> = {
  queued: {
    header:
      "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 hover:-translate-y-0.5 hover:border-amber-300 hover:from-amber-100 hover:to-orange-100 hover:shadow-sm",
    badge: "bg-amber-100 text-amber-800",
    chevron: "text-amber-600",
    emptyText: "text-amber-700",
  },
  inProgress: {
    header:
      "border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 hover:-translate-y-0.5 hover:border-sky-300 hover:from-sky-100 hover:to-cyan-100 hover:shadow-sm",
    badge: "bg-sky-100 text-sky-800",
    chevron: "text-sky-600",
    emptyText: "text-sky-700",
  },
  ready: {
    header:
      "border-brand-200 bg-gradient-to-r from-brand-50 to-emerald-50 hover:-translate-y-0.5 hover:border-brand-300 hover:from-brand-100 hover:to-emerald-100 hover:shadow-sm",
    badge: "bg-brand-100 text-brand-800",
    chevron: "text-brand-600",
    emptyText: "text-brand-700",
  },
};

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function KioskOrdersOverviewPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";
  const tenantPrefix = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[1] === "kiosk") {
      return `/${parts[0]}`;
    }
    return "";
  }, [pathname]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusDetailModal, setStatusDetailModal] = useState<{
    status: "QUEUED" | "IN_PROGRESS" | "READY_FOR_PICKUP";
    title: string;
  } | null>(null);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    {
      queued: true,
      inProgress: true,
      ready: true,
    }
  );

  const reload = async (silent = false) => {
    if (!storeId) {
      setError("缺少 storeId，請由店內 kiosk 入口進入。");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/orders?storeId=${encodeURIComponent(storeId)}&limit=120`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("載入失敗");
      const data = (await res.json()) as { items: Order[] };
      const visible = (data.items ?? []).filter((o) =>
        ["QUEUED", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED"].includes(
          o.status
        )
      );
      setOrders(visible);
    } catch (e) {
      console.error(e);
      setError("無法載入訂單總覽，請稍後再試。");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void reload(true);
    }, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const groups = useMemo(() => {
    return {
      queued: orders.filter((o) => o.status === "QUEUED"),
      inProgress: orders.filter((o) => o.status === "IN_PROGRESS"),
      ready: orders.filter((o) => o.status === "READY_FOR_PICKUP"),
      completed: orders.filter((o) => o.status === "COMPLETED").slice(0, 20),
    };
  }, [orders]);

  const kioskHomeHref = useMemo(() => {
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
    return `${tenantPrefix}/kiosk${qs}`;
  }, [storeId, tenantPrefix]);

  const statusDetailOrders = useMemo(() => {
    if (!statusDetailModal) return [];
    return orders.filter((o) => o.status === statusDetailModal.status);
  }, [orders, statusDetailModal]);

  const renderOrderCard = (order: Order) => (
    <button
      type="button"
      key={order.id}
      onClick={() => setSelectedOrder(order)}
      className="w-full rounded-xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-3 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:from-brand-50/40 hover:to-white hover:shadow-lg lg:p-4"
    >
      <div
        className="flex flex-col gap-3
       lg:items-start lg:justify-between"
      >
        <div className="lg:min-w-[220px] lg:shrink-0">
          <p className="text-base font-bold text-slate-900 lg:text-lg">
            {order.displayId}
          </p>
          <p className="mt-1 text-xs text-slate-600 lg:text-sm">
            預估完成於 {formatTime(order.customerEta)}
          </p>
        </div>
        <div className="mt-1 space-y-1 lg:mt-0 lg:flex-1 lg:columns-2 lg:gap-8 lg:space-y-0">
          {order.items.slice(0, 3).map((item) => (
            <p
              key={item.id}
              className="mb-1 break-inside-avoid text-sm text-slate-800"
            >
              {item.name} x{item.quantity}
            </p>
          ))}
          {order.items.length > 3 && (
            <p className="mb-1 inline-flex items-center break-inside-avoid text-xs text-slate-500">
              ...還有 {order.items.length - 3} 項
            </p>
          )}
        </div>
      </div>
    </button>
  );

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderSectionContent = ({
    keyName,
    emptyText,
    items,
  }: {
    keyName: SectionKey;
    emptyText: string;
    items: Order[];
  }) => (
    <div className="space-y-3">
      {items.length > 0 ? (
        items.map(renderOrderCard)
      ) : (
        <p className={`text-sm ${sectionStyles[keyName].emptyText}`}>
          {emptyText}
        </p>
      )}
    </div>
  );

  const renderMobileCollapsibleSection = ({
    keyName,
    title,
    count,
    emptyText,
    items,
    statusCode,
  }: {
    keyName: SectionKey;
    title: string;
    count: number;
    emptyText: string;
    items: Order[];
    statusCode: "QUEUED" | "IN_PROGRESS" | "READY_FOR_PICKUP";
  }) => {
    const isOpen = openSections[keyName];
    return (
      <Card className="border-slate-300">
        <button
          type="button"
          onClick={() => {
            toggleSection(keyName);
            setStatusDetailModal({ status: statusCode, title });
          }}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-all duration-300 ${sectionStyles[keyName].header}`}
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900">
              {title}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sectionStyles[keyName].badge}`}
            >
              {count}
            </span>
          </div>
          <span
            className={`text-sm transition-transform duration-300 ${sectionStyles[keyName].chevron} ${
              isOpen ? "rotate-180" : "rotate-0"
            }`}
          >
            ▼
          </span>
        </button>
        <div
          className={`grid transition-all duration-300 ease-out ${
            isOpen
              ? "mt-3 grid-rows-[1fr] opacity-100"
              : "mt-0 grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            {renderSectionContent({ keyName, emptyText, items })}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-wabi-700">訂單總覽</h2>
            <p className="text-sm text-wabi-500">
              顯示目前訂單狀態，僅供查詢不可操作。
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void reload()}
              className="rounded-lg border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2 text-sm font-medium text-sky-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:from-sky-100 hover:to-cyan-100 hover:shadow-md"
            >
              立即更新
            </button>
            <button
              type="button"
              onClick={() => router.push(kioskHomeHref)}
              className="rounded-lg border border-brand-200 bg-gradient-to-r from-brand-50 to-emerald-50 px-3 py-2 text-sm font-medium text-brand-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:from-brand-100 hover:to-emerald-100 hover:shadow-md"
            >
              回到點餐
            </button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card>
          <p className="text-sm text-slate-500">載入中...</p>
        </Card>
      ) : error ? (
        <Card>
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:hidden">
            {renderMobileCollapsibleSection({
              keyName: "queued",
              title: "待開始",
              count: groups.queued.length,
              emptyText: "目前沒有待開始訂單",
              items: groups.queued,
              statusCode: "QUEUED",
            })}

            {renderMobileCollapsibleSection({
              keyName: "inProgress",
              title: "製作中",
              count: groups.inProgress.length,
              emptyText: "目前沒有製作中訂單",
              items: groups.inProgress,
              statusCode: "IN_PROGRESS",
            })}

            {renderMobileCollapsibleSection({
              keyName: "ready",
              title: "待取貨",
              count: groups.ready.length,
              emptyText: "目前沒有待取貨訂單",
              items: groups.ready,
              statusCode: "READY_FOR_PICKUP",
            })}
          </div>

          <div className="hidden gap-4 lg:grid lg:grid-cols-3">
            <Card className="border-slate-300">
              <button
                type="button"
                onClick={() =>
                  setStatusDetailModal({ status: "QUEUED", title: "待開始" })
                }
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${sectionStyles.queued.header}`}
              >
                <span className="text-base font-semibold text-slate-900">
                  待開始
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sectionStyles.queued.badge}`}
                >
                  {groups.queued.length}
                </span>
              </button>
              <div className="mt-3">
                {renderSectionContent({
                  keyName: "queued",
                  emptyText: "目前沒有待開始訂單",
                  items: groups.queued,
                })}
              </div>
            </Card>

            <Card className="border-slate-300">
              <button
                type="button"
                onClick={() =>
                  setStatusDetailModal({ status: "IN_PROGRESS", title: "製作中" })
                }
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${sectionStyles.inProgress.header}`}
              >
                <span className="text-base font-semibold text-slate-900">
                  製作中
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sectionStyles.inProgress.badge}`}
                >
                  {groups.inProgress.length}
                </span>
              </button>
              <div className="mt-3">
                {renderSectionContent({
                  keyName: "inProgress",
                  emptyText: "目前沒有製作中訂單",
                  items: groups.inProgress,
                })}
              </div>
            </Card>

            <Card className="border-slate-300">
              <button
                type="button"
                onClick={() =>
                  setStatusDetailModal({ status: "READY_FOR_PICKUP", title: "待取貨" })
                }
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${sectionStyles.ready.header}`}
              >
                <span className="text-base font-semibold text-slate-900">
                  待取貨
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sectionStyles.ready.badge}`}
                >
                  {groups.ready.length}
                </span>
              </button>
              <div className="mt-3">
                {renderSectionContent({
                  keyName: "ready",
                  emptyText: "目前沒有待取貨訂單",
                  items: groups.ready,
                })}
              </div>
            </Card>
          </div>
        </>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 !mt-0 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl transition-all duration-300">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  訂單明細：{selectedOrder.displayId}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  預估完成於 {formatTime(selectedOrder.customerEta)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-100 hover:text-slate-700"
              >
                關閉
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
              <div
                className={`rounded-lg border p-3 text-sm text-slate-700 ${
                  orderStatusSummaryStyles[selectedOrder.status]?.container ??
                  "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="flex flex-wrap items-center gap-2">
                  <span>狀態：</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      orderStatusSummaryStyles[selectedOrder.status]?.badge ??
                      "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {statusLabels[selectedOrder.status] ?? selectedOrder.status}
                  </span>
                  <span>| 付款：</span>
                  <span>
                    {selectedOrder.paymentStatus === "PAID" ? "已付款" : "未付款"}
                  </span>
                </p>
                <p className="mt-1 font-medium">總金額：${selectedOrder.total}</p>
              </div>
              {selectedOrder.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {item.name} x{item.quantity}
                  </p>
                  {item.customizations.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-medium text-slate-600">客製化</p>
                      {item.customizations.map((c, idx) => (
                        <p key={`${item.id}-${idx}`} className="text-xs text-slate-600">
                          - {c.label} x{c.quantity}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">無客製化</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {statusDetailModal && (
        <div className="fixed inset-0 z-[55] !mt-0 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="text-lg font-semibold text-slate-900">
                {statusDetailModal.title} 所有訂單明細（{statusDetailOrders.length}）
              </p>
              <button
                type="button"
                onClick={() => setStatusDetailModal(null)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                關閉
              </button>
            </div>
            <div className="max-h-[72vh] space-y-4 overflow-y-auto rounded-b-xl bg-gradient-to-b from-slate-50 to-slate-100/70 px-5 py-4">
              {statusDetailOrders.length > 0 ? (
                statusDetailOrders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div
                      className={`rounded-lg border p-3 ${
                        orderStatusSummaryStyles[order.status]?.container ??
                        "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <p className="text-base font-semibold text-slate-900">{order.displayId}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span>狀態：</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            orderStatusSummaryStyles[order.status]?.badge ??
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {statusLabels[order.status] ?? order.status}
                        </span>
                        <span>| 付款：</span>
                        <span>{order.paymentStatus === "PAID" ? "已付款" : "未付款"}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        預估完成於 {formatTime(order.customerEta)}
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-700">總金額：${order.total}</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {order.items.map((item) => (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.name} x{item.quantity}
                          </p>
                          {item.customizations.length > 0 ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs font-medium text-slate-600">客製化</p>
                              {item.customizations.map((c, idx) => (
                                <p key={`${item.id}-${idx}`} className="text-xs text-slate-600">
                                  - {c.label} x{c.quantity}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-slate-500">無客製化</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">目前沒有該狀態訂單</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
