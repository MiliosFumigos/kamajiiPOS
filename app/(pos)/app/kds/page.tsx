"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  status: string;
  paymentStatus: "UNPAID" | "PAID";
  placedAt: string;
  startedAt?: string | null;
  readyAt?: string | null;
  totalPrepMinutes?: number;
  // 客人固定看的「起始預估完成時間」
  customerEta?: string | null;
  // 店員用的「動態預估完成時間」
  staffEta?: string | null;
  // 兼容舊版：目前等同 staffEta
  eta?: string | null;
  items: OrderItem[];
};

const statusLabels: Record<string, string> = {
  QUEUED: "待開始",
  IN_PROGRESS: "製作中",
  READY_FOR_PICKUP: "待取貨",
  COMPLETED: "完成",
  CANCELLED: "已取消",
};

function formatTime(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function minutesSince(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}

function formatEta(iso: string | null | undefined, minutes: number | null | undefined) {
  if (!iso) return null;
  const m = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes as number)) : 0;
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  const eta = new Date(base.getTime() + m * 60_000);
  return formatTime(eta);
}

function urgencyClass(waitMins: number) {
  if (waitMins >= 15) return "border-red-300 bg-red-50";
  if (waitMins >= 10) return "border-amber-300 bg-amber-50";
  return "border-slate-200 bg-white";
}

function itemLines(items: OrderItem[]) {
  return (
    items?.map((it) => {
      const cust =
        it.customizations?.length > 0
          ? it.customizations.map((c) => `${c.label}×${c.quantity}`).join("，")
          : "";
      return {
        key: it.id,
        main: `${it.name} ×${it.quantity}`,
        sub: cust ? `客製：${cust}` : null,
      };
    }) ?? []
  );
}

export default function AppKdsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const canUseKds = role === Role.MANAGER || role === Role.STAFF;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; ts: number } | null>(null);
  const fetchingRef = useRef(false);
  const baselineRef = useRef<Set<string> | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const newOrderUntilRef = useRef<Map<string, number>>(new Map());

  const showToast = (message: string) => {
    const ts = Date.now();
    setToast({ message, ts });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast((prev) => (prev?.ts === ts ? null : prev));
    }, 3500);
  };

  const playBeep = () => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      osc.onended = () => void ctx.close();
    } catch {
      // ignore
    }
  };

  const reload = async (opts?: { silent?: boolean }) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders?limit=120&date=today`, { cache: "no-store" });
      if (!res.ok) throw new Error("載入訂單失敗");
      const data = (await res.json()) as { items: Order[] };
      const nextOrders = data.items ?? [];

      // 新單通知（只在 baseline 建立後才觸發，避免首次載入狂通知）
      const prevIds = baselineRef.current;
      const nextQueuedIds = new Set(
        nextOrders.filter((o) => o.status === "QUEUED").map((o) => o.id)
      );

      if (!prevIds) {
        baselineRef.current = nextQueuedIds;
      } else {
        const newQueued: string[] = [];
        for (const id of nextQueuedIds) {
          if (!prevIds.has(id)) newQueued.push(id);
        }
        baselineRef.current = nextQueuedIds;

        if (newQueued.length > 0 && opts?.silent) {
          const until = Date.now() + 30_000;
          newQueued.forEach((id) => newOrderUntilRef.current.set(id, until));
          showToast(`新訂單 ${newQueued.length} 筆`);
          if (soundEnabled) playBeep();
        }
      }

      setOrders(nextOrders);
    } catch (e) {
      console.error(e);
      setError("無法載入訂單，請稍後再試。");
      setOrders([]);
    } finally {
      if (!opts?.silent) setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void reload({ silent: true });
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const updateOrderStatus = async (orderId: string, status: string) => {
    setSaving(orderId);
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
      await reload({ silent: true });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setSaving(null);
    }
  };

  const active = useMemo(() => {
    const list = orders.filter((o) =>
      ["QUEUED", "IN_PROGRESS", "READY_FOR_PICKUP"].includes(o.status)
    );
    // KDS 預設以等待最久在上方
    return list.sort(
      (a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
    );
  }, [orders]);

  const queued = useMemo(() => active.filter((o) => o.status === "QUEUED"), [active]);
  const inProgress = useMemo(
    () => active.filter((o) => o.status === "IN_PROGRESS"),
    [active]
  );
  const ready = useMemo(
    () => active.filter((o) => o.status === "READY_FOR_PICKUP"),
    [active]
  );

  const lastUpdated = useMemo(() => new Date(), [orders]);

  const Column = ({
    title,
    status,
    items,
  }: {
    title: string;
    status: "QUEUED" | "IN_PROGRESS" | "READY_FOR_PICKUP";
    items: Order[];
  }) => {
    return (
      <div className="space-y-3">
        <div className="sticky top-0 z-10 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {items.length}
            </span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            目前沒有項目
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((o) => {
              const waitMins = minutesSince(o.placedAt);
              const lines = itemLines(o.items);
              const canAdvance = saving !== o.id;
              const customerEtaText = o.customerEta
                ? formatTime(new Date(o.customerEta))
                : o.eta
                  ? formatTime(new Date(o.eta))
                  : null;
              const staffEtaText = o.staffEta
                ? formatTime(new Date(o.staffEta))
                : o.eta
                  ? formatTime(new Date(o.eta))
                  : formatEta(o.startedAt, o.totalPrepMinutes);
              const isNew = (() => {
                const until = newOrderUntilRef.current.get(o.id);
                if (!until) return false;
                if (Date.now() > until) {
                  newOrderUntilRef.current.delete(o.id);
                  return false;
                }
                return true;
              })();

              const primaryAction =
                status === "QUEUED"
                  ? {
                      label: "開始製作",
                      next: "IN_PROGRESS",
                      className:
                        "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50",
                    }
                  : status === "IN_PROGRESS"
                    ? {
                        label: "完成製作",
                        next: "READY_FOR_PICKUP",
                        className:
                          "bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50",
                      }
                    : {
                        label: "取餐完成",
                        next: "COMPLETED",
                        className:
                          "bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50",
                      };

              return (
                <div
                  key={o.id}
                  className={`rounded-2xl border p-4 shadow-sm ${urgencyClass(waitMins)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-2xl font-bold tracking-tight text-slate-900">
                          {o.displayId}
                        </div>
                        {isNew && (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                            NEW
                          </span>
                        )}
                        <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {statusLabels[o.status] || o.status}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span>下單 {formatTime(new Date(o.placedAt))}</span>
                        <span className="font-medium">
                          已等 {waitMins} 分
                        </span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                          客 ETA {customerEtaText ?? "—"}
                        </span>
                        {(o.status === "QUEUED" || o.status === "IN_PROGRESS") && (
                          <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            店員動態 ETA {staffEtaText ?? "—"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>共 {o.items?.reduce((acc, it) => acc + (it.quantity ?? 0), 0)} 件</div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {lines.map((l) => (
                      <div key={l.key} className="rounded-lg bg-white/70 p-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {l.main}
                        </div>
                        {l.sub && (
                          <div className="mt-0.5 text-xs font-medium text-slate-700">
                            {l.sub}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${primaryAction.className}`}
                      onClick={() => void updateOrderStatus(o.id, primaryAction.next)}
                      disabled={!canAdvance}
                    >
                      {saving === o.id ? "更新中..." : primaryAction.label}
                    </button>
                    <div className="text-xs text-slate-500">
                      {o.totalPrepMinutes != null ? (
                        <span>預估 {Math.max(0, Math.floor(o.totalPrepMinutes))} 分</span>
                      ) : (
                        <span>預估 —</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (!canUseKds) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          您目前的角色為 {role ?? "未知"}，僅分店長與店員可以操作 KDS。
        </p>
      </Card>
    );
  }

  return (
    <div className="relative space-y-5">
      {toast && (
        <div className="pointer-events-none fixed right-6 top-6 z-50">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <p className="text-sm font-semibold text-slate-900">{toast.message}</p>
            <p className="mt-0.5 text-xs text-slate-500">KDS 會自動更新</p>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">KDS（廚房看板）</h2>
          <p className="mt-1 text-sm text-slate-600">
            只顯示進行中訂單（待開始 / 製作中 / 待取貨）。點卡片按鈕即可推進流程。
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">自動更新</span>
            <button
              type="button"
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                autoRefresh
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setAutoRefresh((v) => !v)}
            >
              {autoRefresh ? "開" : "關"}
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">提示音</span>
            <button
              type="button"
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                soundEnabled
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setSoundEnabled((v) => !v)}
              title="瀏覽器通常需要先互動一次才允許播放聲音"
            >
              {soundEnabled ? "開" : "關"}
            </button>
          </div>
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => void reload()}
            disabled={loading}
          >
            立即刷新
          </button>
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => void document.documentElement.requestFullscreen?.()}
          >
            全螢幕
          </button>
        </div>
      </div>

      <Card>
        {loading ? (
          <p className="px-4 py-3 text-sm text-slate-500">載入中...</p>
        ) : error ? (
          <p className="px-4 py-3 text-sm text-red-600">{error}</p>
        ) : (
          <div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
            最後更新：{formatTime(lastUpdated)}
          </div>
        )}

        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <Column title="待開始" status="QUEUED" items={queued} />
          <Column title="製作中" status="IN_PROGRESS" items={inProgress} />
          <Column title="待取貨" status="READY_FOR_PICKUP" items={ready} />
        </div>
      </Card>
    </div>
  );
}

