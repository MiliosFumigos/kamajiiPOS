"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Role } from "@/lib/types";

type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  customizations: { label: string; quantity: number }[];
  prepMinutes?: number;
};

type Order = {
  id: string;
  displayId: string;
  total: number;
  // 訂單製作流程狀態
  status: string;
  // 付款狀態
  paymentStatus: "UNPAID" | "PAID";
  placedAt: string;
  startedAt?: string | null;
  readyAt?: string | null;
  totalPrepMinutes?: number;
  // 客人固定看的「起始預估完成時間」
  customerEta?: string | null;
  // 店員動態看的 ETA（會因插隊/狀態變更重算）
  staffEta?: string | null;
  // 兼容舊版欄位：目前等同 staffEta
  eta?: string | null;
  items: OrderItem[];
};

const statusLabels: Record<string, string> = {
  QUEUED: "準備中",
  IN_PROGRESS: "製作中",
  READY_FOR_PICKUP: "待取貨",
  COMPLETED: "完成",
  CANCELLED: "已取消",
};

const statusBadgeClass: Record<string, string> = {
  UNPAID: "bg-slate-100 text-slate-800",
  PAID: "bg-slate-100 text-slate-800",
  QUEUED: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  READY_FOR_PICKUP: "bg-purple-100 text-purple-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const paymentStatusLabels: Record<string, string> = {
  UNPAID: "未付款",
  PAID: "已付款",
};

const paymentBadgeClass: Record<string, string> = {
  UNPAID: "bg-red-100 text-red-800",
  PAID: "bg-emerald-100 text-emerald-800",
};

type OrderRow = Order & {
  itemsText: string;
};

type SortKey = "displayId" | "placedAt" | "total" | "status" | "paymentStatus";

type SortConfig = {
  key: SortKey;
  direction: "asc" | "desc";
} | null;

function formatTime(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatEta(
  iso: string | null | undefined,
  minutes: number | null | undefined
) {
  if (!iso) return null;
  const m = Number.isFinite(minutes)
    ? Math.max(0, Math.floor(minutes as number))
    : 0;
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  const eta = new Date(base.getTime() + m * 60_000);
  return formatTime(eta);
}

export default function AppOrdersPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canUseOrders = role === Role.MANAGER || role === Role.STAFF;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [etaUpdatingIds, setEtaUpdatingIds] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<"today" | "all" | string>(
    "today"
  );
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | keyof typeof statusLabels
  >("ALL");
  const [paymentFilter, setPaymentFilter] = useState<
    "ALL" | keyof typeof paymentStatusLabels
  >("ALL");
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const reload = async (dateParam?: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const dateQuery =
        dateParam && dateParam !== "all"
          ? `&date=${encodeURIComponent(dateParam)}`
          : "";
      const res = await fetch(`/api/orders?limit=80${dateQuery}`);
      if (!res.ok) throw new Error("載入訂單失敗");
      const data = (await res.json()) as { items: Order[]; dates?: string[] };
      setOrders(data.items ?? []);
      if (Array.isArray(data.dates)) {
        setDates(data.dates);
      }
    } catch (e) {
      console.error(e);
      setError("無法載入訂單，請稍後再試。");
      setOrders([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void reload(selectedDate);
  }, [selectedDate]);

  const rows: OrderRow[] = useMemo(() => {
    return orders.map((o) => {
      const itemsText =
        o.items
          ?.map((it) => {
            const cust =
              it.customizations?.length > 0
                ? `（${it.customizations
                    .map((c) => `${c.label}x${c.quantity}`)
                    .join("，")}）`
                : "";
            return `${it.name} x${it.quantity}${cust}`;
          })
          .join("、") ?? "";

      return { ...o, itemsText };
    });
  }, [orders]);

  const displayRows: OrderRow[] = useMemo(() => {
    let result = [...rows];

    if (onlyActive) {
      result = result.filter((r) =>
        ["QUEUED", "IN_PROGRESS", "READY_FOR_PICKUP"].includes(r.status)
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }

    if (paymentFilter !== "ALL") {
      result = result.filter((r) => r.paymentStatus === paymentFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => {
        const id = r.displayId?.toLowerCase() ?? "";
        const items = r.itemsText?.toLowerCase() ?? "";
        return id.includes(q) || items.includes(q);
      });
    }

    if (sortConfig) {
      const { key, direction } = sortConfig;
      result.sort((a, b) => {
        let av: any = a[key];
        let bv: any = b[key];

        if (key === "placedAt") {
          av = new Date(a.placedAt).getTime();
          bv = new Date(b.placedAt).getTime();
        }

        if (typeof av === "string" && typeof bv === "string") {
          const comp = av.localeCompare(bv);
          return direction === "asc" ? comp : -comp;
        }

        const na = Number(av ?? 0);
        const nb = Number(bv ?? 0);
        const comp = na - nb;
        return direction === "asc" ? comp : -comp;
      });
    }

    return result;
  }, [rows, onlyActive, statusFilter, paymentFilter, search, sortConfig]);

  const toggleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      return null;
    });
  };

  const getSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) return "↕";
    return sortConfig.direction === "asc" ? "↑" : "↓";
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    setSaving(orderId);
    const affectedIds = new Set(
      orders
        .filter((o) => o.status === "QUEUED" || o.status === "IN_PROGRESS")
        .map((o) => o.id)
    );
    affectedIds.add(orderId);
    setEtaUpdatingIds(affectedIds);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status }),
      });
      if (!res.ok) {
        const data = (await res.json()) as any;
        throw new Error(data?.error || "更新失敗");
      }
      const data = (await res.json()) as any;

      // 後端會回傳更新後的 order（含 startedAt / totalPrepMinutes）
      if (data?.order?.id) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, ...data.order } : o))
        );
      } else {
        // fallback（理論上不會走到）
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status } : o))
        );
      }

      // ETA 是「全隊列」一起重算的，所以狀態改變後要立刻重抓一次
      await reload(selectedDate, { silent: true });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setSaving(null);
      setEtaUpdatingIds(new Set());
    }
  };

  const updatePaymentStatus = async (
    orderId: string,
    paymentStatus: "UNPAID" | "PAID"
  ) => {
    setSaving(orderId);
    try {
      // 樂觀更新：只更新前端 paymentStatus，不整頁重抓
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                paymentStatus,
              }
            : o
        )
      );

      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, paymentStatus }),
      });
      if (!res.ok) {
        const data = (await res.json()) as any;
        throw new Error(data?.error || "更新失敗");
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "更新失敗");
      // 失敗時簡單做法：重新載入目前日期的訂單，還原狀態
      void reload(selectedDate);
    } finally {
      setSaving(null);
    }
  };

  if (!canUseOrders) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          您目前的角色為 {role ?? "未知"}，僅分店長與店員可以操作訂單。
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">訂單管理</h2>
          <p className="mt-1 text-sm text-slate-600">
            此處顯示本店最新訂單，並可切換訂單狀態與付款狀態。
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-end">
          <div className="flex flex-wrap items-center gap-2 text-sm w-full md:w-auto">
            <span className="text-slate-600">顯示日期</span>
            <select
              className="w-full md:w-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-sm text-slate-700"
              value={selectedDate}
              onChange={(e) =>
                setSelectedDate(e.target.value as "today" | "all" | string)
              }
            >
              <option value="today">今天</option>
              <option value="all">全部最近訂單</option>
              {dates.map((d) => (
                <option key={d} value={d} className="text-center">
                  {`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="w-full md:w-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => void reload(selectedDate)}
            disabled={loading}
          >
            重新整理
          </button>
        </div>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">訂單狀態</span>
              <select
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as "ALL" | keyof typeof statusLabels
                  )
                }
              >
                <option value="ALL">全部</option>
                {Object.keys(statusLabels).map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">付款狀態</span>
              <select
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
                value={paymentFilter}
                onChange={(e) =>
                  setPaymentFilter(
                    e.target.value as "ALL" | keyof typeof paymentStatusLabels
                  )
                }
              >
                <option value="ALL">全部</option>
                {Object.keys(paymentStatusLabels).map((s) => (
                  <option key={s} value={s}>
                    {paymentStatusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
                onlyActive
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setOnlyActive((v) => !v)}
            >
              只看進行中（準備中 / 製作中 / 待取貨）
            </button>
            <div className="w-full flex flex-wrap items-center justify-center gap-2 text-sm md:w-auto md:ml-auto md:flex-nowrap md:justify-end">
              <input
                className="w-56 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
                placeholder="搜尋訂單編號 / 內容關鍵字"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="text-xs text-slate-500">
                顯示 {displayRows.length} 筆（總共 {rows.length} 筆）
              </span>
            </div>
          </div>
        </div>
        {loading ? (
          <p className="px-4 py-3 text-sm text-slate-500">載入中...</p>
        ) : error ? (
          <p className="px-4 py-3 text-sm text-red-600">{error}</p>
        ) : displayRows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">
            目前沒有符合條件的訂單。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th
                    className="cursor-pointer select-none pb-3 text-left text-sm font-medium text-slate-600"
                    onClick={() => toggleSort("displayId")}
                  >
                    <span className="inline-flex items-center gap-1">
                      訂單編號{" "}
                      <span className="text-[11px] text-slate-400">
                        {getSortIcon("displayId")}
                      </span>
                    </span>
                  </th>
                  <th
                    className="cursor-pointer select-none pb-3 text-left text-sm font-medium text-slate-600"
                    onClick={() => toggleSort("placedAt")}
                  >
                    <span className="inline-flex items-center gap-1">
                      時間{" "}
                      <span className="text-[11px] text-slate-400">
                        {getSortIcon("placedAt")}
                      </span>
                    </span>
                  </th>
                  <th className="pb-3 text-left text-sm font-medium text-slate-600">
                    內容
                  </th>
                  <th
                    className="cursor-pointer select-none pb-3 text-left text-sm font-medium text-slate-600"
                    onClick={() => toggleSort("total")}
                  >
                    <span className="inline-flex items-center gap-1">
                      金額{" "}
                      <span className="text-[11px] text-slate-400">
                        {getSortIcon("total")}
                      </span>
                    </span>
                  </th>
                  <th
                    className="cursor-pointer select-none pb-3 text-left text-sm font-medium text-slate-600"
                    onClick={() => toggleSort("status")}
                  >
                    <span className="inline-flex items-center gap-1">
                      訂單 / 付款狀態{" "}
                      <span className="text-[11px] text-slate-400">
                        {getSortIcon("status")}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100">
                    <td className="py-3 font-medium">{order.displayId}</td>
                    <td className="py-3 text-slate-600">
                      {formatTime(new Date(order.placedAt))}
                    </td>
                    <td className="py-3 text-slate-600">{order.itemsText}</td>
                    <td className="py-3">${order.total}</td>
                    <td className="py-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              statusBadgeClass[order.status] ||
                              "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {statusLabels[order.status] || order.status}
                          </span>
                          {(order.status === "IN_PROGRESS" ||
                            order.status === "QUEUED") && (
                            <>
                              <span className="text-xs text-slate-500">
                                客人起始 ETA{" "}
                                {order.customerEta
                                  ? formatTime(new Date(order.customerEta))
                                  : "—"}
                              </span>
                              <span className="text-xs text-slate-500">
                                店員動態 ETA{" "}
                                {order.staffEta
                                  ? formatTime(new Date(order.staffEta))
                                  : "—"}
                              </span>
                            </>
                          )}
                          {etaUpdatingIds.has(order.id) && (
                            <span className="text-xs text-slate-500">
                              更新中…
                            </span>
                          )}
                          <span className="text-xs text-slate-500">
                            預估{" "}
                            {Math.max(
                              0,
                              Math.floor(order.totalPrepMinutes ?? 0)
                            )}{" "}
                            分
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              paymentBadgeClass[order.paymentStatus]
                            }`}
                          >
                            {paymentStatusLabels[order.paymentStatus]}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500">訂單</span>
                            <select
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                              value={order.status}
                              onChange={(e) =>
                                void updateOrderStatus(order.id, e.target.value)
                              }
                              disabled={
                                saving === order.id ||
                                etaUpdatingIds.has(order.id)
                              }
                            >
                              <option value="QUEUED">
                                {statusLabels.QUEUED}
                              </option>
                              <option value="IN_PROGRESS">
                                {statusLabels.IN_PROGRESS}
                              </option>
                              <option value="READY_FOR_PICKUP">
                                {statusLabels.READY_FOR_PICKUP}
                              </option>
                              <option value="COMPLETED">
                                {statusLabels.COMPLETED}
                              </option>
                              <option value="CANCELLED">
                                {statusLabels.CANCELLED}
                              </option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500">付款</span>
                            <select
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                              value={order.paymentStatus}
                              onChange={(e) =>
                                void updatePaymentStatus(
                                  order.id,
                                  e.target.value as "UNPAID" | "PAID"
                                )
                              }
                              disabled={
                                saving === order.id ||
                                order.status === "CANCELLED" ||
                                etaUpdatingIds.has(order.id)
                              }
                            >
                              {Object.keys(paymentStatusLabels).map((s) => (
                                <option key={s} value={s}>
                                  {paymentStatusLabels[s]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
