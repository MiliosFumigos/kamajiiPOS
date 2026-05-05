"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { InfoPopover } from "@/components/ui/InfoPopover";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type AnalyticsResponse = {
  role: "OWNER" | "MANAGER";
  range: { start: string; end: string; days: number };
  stores: { id: string; name: string }[];
  selectedStoreId: string | null;
  meta?: {
    generatedAt: string;
    cacheStatus: "HIT" | "MISS";
    updateCadence: string;
    forceRefreshed?: boolean;
  };
  summary: {
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    cancelRate: number;
    overtimeRate: number;
  };
  charts: {
    peakHours: { hour: number; salesQty: number; orderCount: number }[];
    topProducts: { name: string; quantity: number; revenue: number }[];
    topCategories: { category: string; quantity: number }[];
    paymentMethods: { method: "CASH" | "CARD"; count: number; revenue: number }[];
    salesTrend: { date: string; revenue: number; orderCount: number; canceled: number }[];
    staffRanking: {
      userId: string;
      name: string;
      orderCount: number;
      revenue: number;
      avgOrderValue: number;
    }[];
    storeComparison: {
      storeId: string;
      storeName: string;
      revenue: number;
      orders: number;
      cancelRate: number;
      overtimeRate: number;
    }[];
    inventoryBurn: {
      ingredientId: string;
      ingredientName: string;
      unit: string;
      consumed: number;
      dailyUsage: number;
      currentStock: number;
      estimatedDaysLeft: number | null;
    }[];
  };
};

type InventoryDetailResponse = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalConsumed: number;
  contributors: { name: string; consumed: number; quantity: number }[];
  customizationContributors: { label: string; consumed: number }[];
  formulaSummary?: string;
  assumptions?: string[];
  includeCancelled?: boolean;
};

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function money(v: number) {
  return `$${v.toLocaleString("zh-TW")}`;
}

function toDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function cacheStatusLabel(status: "HIT" | "MISS") {
  return status === "HIT" ? "快取資料" : "即時計算";
}

export function AnalyticsDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [storeId, setStoreId] = useState<string>("ALL");
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000))
  );
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [cacheStatus, setCacheStatus] = useState<"HIT" | "MISS">("MISS");
  const [refreshToken, setRefreshToken] = useState(0);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const [expandedIngredientId, setExpandedIngredientId] = useState<string | null>(null);
  const [inventoryDetailById, setInventoryDetailById] = useState<Record<string, InventoryDetailResponse>>({});
  const [inventoryDetailLoadingId, setInventoryDetailLoadingId] = useState<string | null>(null);
  const [detailOnlyActive, setDetailOnlyActive] = useState(true);
  const [staffSortBy, setStaffSortBy] = useState<"revenue" | "orders">("revenue");
  const peakHourChartInstanceRef = useRef<any>(null);
  const paymentChartInstanceRef = useRef<any>(null);
  const salesTrendChartInstanceRef = useRef<any>(null);
  const storeComparisonChartInstanceRef = useRef<any>(null);
  const customRangeError = useMemo(() => {
    if (!useCustomRange) return null;
    if (!startDate || !endDate) return "請完整選擇起始與結束日期";
    if (startDate > endDate) return "開始日期不可晚於結束日期";
    return null;
  }, [useCustomRange, startDate, endDate]);

  useEffect(() => {
    if (customRangeError) {
      setLoading(false);
      setIsForceRefreshing(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("days", String(days));
        if (useCustomRange && startDate && endDate) {
          qs.set("startDate", startDate);
          qs.set("endDate", endDate);
        }
        if (storeId !== "ALL") qs.set("storeId", storeId);
        if (refreshToken > 0) qs.set("forceRefresh", "1");
        const res = await fetch(`/api/analytics/overview?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("分析資料讀取失敗");
        const json = (await res.json()) as AnalyticsResponse;
        const headerCache = (res.headers.get("x-analytics-cache") ?? "").toUpperCase();
        setCacheStatus(headerCache === "HIT" ? "HIT" : "MISS");
        setData(json);
      } catch (e) {
        console.error(e);
        setError("無法載入分析資料，請稍後再試。");
      } finally {
        setLoading(false);
        setIsForceRefreshing(false);
      }
    };
    void fetchData();
  }, [days, storeId, useCustomRange, startDate, endDate, refreshToken, customRangeError]);

  useEffect(() => {
    if (!data) return;
    if (data.role === "MANAGER") {
      setStoreId(data.selectedStoreId ?? "ALL");
      return;
    }
    if (storeId === "ALL") return;
    if (!data.stores.some((s) => s.id === storeId)) setStoreId("ALL");
  }, [data, storeId]);

  const peakHourOption = useMemo(() => {
    const rows = data?.charts.peakHours ?? [];
    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: rows.map((r) => `${String(r.hour).padStart(2, "0")}:00`) },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: rows.map((r) => r.salesQty), smooth: true }],
      grid: { left: 35, right: 12, top: 24, bottom: 28 },
    };
  }, [data]);

  const salesTrendOption = useMemo(() => {
    const rows = data?.charts.salesTrend ?? [];
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", data: rows.map((r) => r.date.slice(5)) },
      yAxis: [{ type: "value" }, { type: "value" }],
      series: [
        { name: "營收", type: "line", data: rows.map((r) => r.revenue), smooth: true },
        { name: "訂單數", type: "bar", yAxisIndex: 1, data: rows.map((r) => r.orderCount) },
      ],
      grid: { left: 42, right: 24, top: 38, bottom: 26 },
    };
  }, [data]);

  const paymentOption = useMemo(() => {
    const rows = data?.charts.paymentMethods ?? [];
    return {
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const value = Number(params?.value ?? 0);
          const total = rows.reduce((acc, r) => acc + r.count, 0);
          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
          return `${params?.name ?? ""}<br/>${value} 筆（${pct}%）`;
        },
      },
      legend: {
        bottom: 0,
        left: "center",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 12 },
      },
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "44%"],
          minAngle: 8,
          avoidLabelOverlap: true,
          label: {
            show: false,
          },
          labelLine: {
            show: false,
          },
          data: rows.map((r) => ({
            name: r.method === "CARD" ? "信用卡" : "現金",
            value: r.count,
          })),
        },
      ],
      media: [
        {
          query: { maxWidth: 430 },
          option: {
            legend: {
              bottom: 2,
              left: "center",
              textStyle: { fontSize: 11 },
            },
            series: [
              {
                radius: ["36%", "60%"],
                center: ["50%", "40%"],
              },
            ],
          },
        },
      ],
    };
  }, [data]);

  const storeComparisonOption = useMemo(() => {
    const rows = data?.charts.storeComparison ?? [];
    return {
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: rows.map((r) => r.storeName),
        axisLabel: { interval: 0, rotate: rows.length > 4 ? 20 : 0 },
      },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: rows.map((r) => r.revenue) }],
      grid: { left: 48, right: 16, top: 24, bottom: 52 },
    };
  }, [data]);

  const dashboardBasePath = useMemo(() => {
    const marker = "/app/dashboard";
    const idx = pathname.indexOf(marker);
    if (idx >= 0) return pathname.slice(0, idx + marker.length);
    return "/app/dashboard";
  }, [pathname]);

  const sortedStaffRanking = useMemo(() => {
    const rows = data?.charts.staffRanking ?? [];
    return [...rows].sort((a, b) =>
      staffSortBy === "revenue" ? b.revenue - a.revenue : b.orderCount - a.orderCount
    );
  }, [data, staffSortBy]);
  const selectedStoreLabel =
    storeId === "ALL" ? "全部分店" : data?.stores?.find((s) => s.id === storeId)?.name ?? storeId;

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-500">分析資料載入中...</p>
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

  const fetchInventoryDetail = async (ingredientId: string, onlyActiveOverride?: boolean) => {
    const onlyActive = onlyActiveOverride ?? detailOnlyActive;
    const cacheKey = `${ingredientId}:${onlyActive ? "active" : "all"}`;
    if (inventoryDetailById[cacheKey]) return;
    setInventoryDetailLoadingId(ingredientId);
    try {
      const qs = new URLSearchParams();
      qs.set("ingredientId", ingredientId);
      qs.set("days", String(days));
      if (useCustomRange && startDate && endDate) {
        qs.set("startDate", startDate);
        qs.set("endDate", endDate);
      }
      if (storeId !== "ALL") qs.set("storeId", storeId);
      qs.set("includeCancelled", onlyActive ? "0" : "1");
      const res = await fetch(`/api/analytics/inventory-detail?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("無法載入明細");
      const json = (await res.json()) as InventoryDetailResponse;
      setInventoryDetailById((prev) => ({ ...prev, [cacheKey]: json }));
    } catch (e) {
      console.error(e);
    } finally {
      setInventoryDetailLoadingId(null);
    }
  };

  const exportInventoryDetailCsv = (detail: InventoryDetailResponse) => {
    const lines: string[] = [];
    lines.push(`原料名稱,${detail.ingredientName}`);
    lines.push(`單位,${detail.unit}`);
    lines.push(`總推估消耗,${detail.totalConsumed.toFixed(2)}`);
    lines.push(`是否包含已取消訂單,${detail.includeCancelled ? "是" : "否"}`);
    if (detail.formulaSummary) lines.push(`公式摘要,${detail.formulaSummary.replace(/,/g, "，")}`);
    lines.push("");
    lines.push("商品貢獻");
    lines.push("排名,商品名稱,推估消耗,售出份數");
    detail.contributors.forEach((c, idx) => {
      lines.push(`${idx + 1},${c.name.replace(/,/g, "，")},${c.consumed.toFixed(2)},${c.quantity}`);
    });
    lines.push("");
    lines.push("客製化貢獻");
    lines.push("排名,客製化名稱,推估消耗");
    detail.customizationContributors.forEach((c, idx) => {
      lines.push(`${idx + 1},${c.label.replace(/,/g, "，")},${c.consumed.toFixed(2)}`);
    });
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-detail-${detail.ingredientName}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const csvEscape = (value: string | number) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const downloadCsv = (filename: string, rows: Array<Array<string | number>>) => {
    const csv = "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSalesTrendCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["報表", "營收與訂單趨勢"],
      ["產生時間", new Date().toLocaleString("zh-TW")],
      ["日期區間", `${data.range.start} ~ ${data.range.end}`],
      ["分店", selectedStoreLabel],
      [],
      ["日期", "營收", "訂單數", "取消單數"],
      ...data.charts.salesTrend.map((r) => [r.date, r.revenue, r.orderCount, r.canceled]),
    ];
    downloadCsv(`sales-trend-${Date.now()}.csv`, rows);
  };

  const exportStoreComparisonCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["報表", "分店比較"],
      ["產生時間", new Date().toLocaleString("zh-TW")],
      ["日期區間", `${data.range.start} ~ ${data.range.end}`],
      [],
      ["分店", "營收", "訂單數", "取消率", "逾時率"],
      ...data.charts.storeComparison.map((r) => [
        r.storeName,
        r.revenue,
        r.orders,
        pct(r.cancelRate),
        pct(r.overtimeRate),
      ]),
    ];
    downloadCsv(`store-comparison-${Date.now()}.csv`, rows);
  };

  const exportStaffRankingCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["報表", "最佳銷售人員"],
      ["產生時間", new Date().toLocaleString("zh-TW")],
      ["日期區間", `${data.range.start} ~ ${data.range.end}`],
      ["分店", selectedStoreLabel],
      ["排序方式", staffSortBy === "revenue" ? "依營收" : "依單數"],
      [],
      ["排名", "員工", "營收", "單數", "平均客單價"],
      ...sortedStaffRanking.map((r, idx) => [idx + 1, r.name, r.revenue, r.orderCount, r.avgOrderValue]),
    ];
    downloadCsv(`staff-ranking-${staffSortBy}-${Date.now()}.csv`, rows);
  };

  const exportChartPng = (instance: any, filename: string) => {
    if (!instance) return;
    const dataUrl = instance.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#fff",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const exportPeakHourCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["報表", "銷售尖峰時段（銷量）"],
      ["產生時間", new Date().toLocaleString("zh-TW")],
      ["日期區間", `${data.range.start} ~ ${data.range.end}`],
      ["分店", selectedStoreLabel],
      [],
      ["時段", "售出總份數", "訂單數"],
      ...data.charts.peakHours.map((r) => [`${String(r.hour).padStart(2, "0")}:00`, r.salesQty, r.orderCount]),
    ];
    downloadCsv(`peak-hours-${Date.now()}.csv`, rows);
  };

  const exportPaymentCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["報表", "支付方式占比"],
      ["產生時間", new Date().toLocaleString("zh-TW")],
      ["日期區間", `${data.range.start} ~ ${data.range.end}`],
      ["分店", selectedStoreLabel],
      [],
      ["支付方式", "筆數", "占比"],
      ...data.charts.paymentMethods.map((r) => [
        r.method === "CARD" ? "信用卡" : "現金",
        r.count,
        pct(data.summary.totalOrders > 0 ? r.count / data.summary.totalOrders : 0),
      ]),
    ];
    downloadCsv(`payment-share-${Date.now()}.csv`, rows);
  };

  const exportTopProductsCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["報表", "銷量排行榜"],
      ["產生時間", new Date().toLocaleString("zh-TW")],
      ["日期區間", `${data.range.start} ~ ${data.range.end}`],
      ["分店", selectedStoreLabel],
      [],
      ["排名", "商品", "售出份數", "營收"],
      ...data.charts.topProducts.slice(0, 8).map((r, idx) => [idx + 1, r.name, r.quantity, r.revenue]),
    ];
    downloadCsv(`top-products-${Date.now()}.csv`, rows);
  };

  const exportTopCategoriesCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["報表", "熱門種類"],
      ["產生時間", new Date().toLocaleString("zh-TW")],
      ["日期區間", `${data.range.start} ~ ${data.range.end}`],
      ["分店", selectedStoreLabel],
      [],
      ["排名", "分類", "售出份數"],
      ...data.charts.topCategories.slice(0, 8).map((r, idx) => [idx + 1, r.category, r.quantity]),
    ];
    downloadCsv(`top-categories-${Date.now()}.csv`, rows);
  };

  const exportInventoryBurnCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["報表", "庫存消耗速度（推估 Top 10）"],
      ["產生時間", new Date().toLocaleString("zh-TW")],
      ["日期區間", `${data.range.start} ~ ${data.range.end}`],
      ["分店", selectedStoreLabel],
      [],
      ["排名", "原料", "日耗", "現有庫存", "推估可用天數", "單位"],
      ...data.charts.inventoryBurn.map((r, idx) => [
        idx + 1,
        r.ingredientName,
        r.dailyUsage,
        r.currentStock,
        r.estimatedDaysLeft ?? "無法估算",
        r.unit,
      ]),
    ];
    downloadCsv(`inventory-burn-${Date.now()}.csv`, rows);
  };

  const openBrowserPrintForPdf = () => {
    const chartInstances = [
      peakHourChartInstanceRef.current,
      paymentChartInstanceRef.current,
      salesTrendChartInstanceRef.current,
      storeComparisonChartInstanceRef.current,
    ];
    for (const inst of chartInstances) {
      if (inst && typeof inst.resize === "function") {
        try {
          inst.resize();
        } catch {
          // ignore
        }
      }
    }
    window.requestAnimationFrame(() => {
      window.setTimeout(() => window.print(), 220);
    });
  };

  return (
    <div id="analytics-dashboard-print" className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">營運可視化分析</h3>
            <p className="text-xs text-slate-500">
              角色：{data.role === "OWNER" ? "品牌持有人" : "分店長"}，區間：近 {data.range.days} 天
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
            <select
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value) as 7 | 30 | 90);
                setUseCustomRange(false);
              }}
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value={7}>近 7 天</option>
              <option value={30}>近 30 天</option>
              <option value={90}>近 90 天</option>
            </select>
            {data.role === "OWNER" && (
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="ALL">全部分店</option>
                {data.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          更新於{" "}
          <span className="font-medium text-slate-800">
            {new Date(data.meta?.generatedAt ?? Date.now()).toLocaleTimeString("zh-TW")}
          </span>
          {" · "}
          來源{" "}
          <span
            className={`rounded px-1.5 py-0.5 font-semibold ${
              cacheStatus === "HIT"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {cacheStatusLabel(cacheStatus)}
          </span>
          {" · "}
          {data.meta?.updateCadence ?? "TTL 5 分鐘"}
          {data.meta?.forceRefreshed ? " · 本次為強制重算" : ""}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-xs text-slate-600">
            <input
              type="checkbox"
              checked={useCustomRange}
              onChange={(e) => setUseCustomRange(e.target.checked)}
              className="mr-1 align-middle"
            />
            自訂日期查詢
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_auto]">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!useCustomRange}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!useCustomRange}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:bg-slate-100"
            />
            {useCustomRange && (
              <span className="self-center text-xs text-slate-500">
                {customRangeError ? (
                  <span className="font-medium text-red-600">{customRangeError}</span>
                ) : (
                  "日期變更會自動更新"
                )}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsForceRefreshing(true);
              setRefreshToken((v) => v + 1);
            }}
            disabled={loading || isForceRefreshing || !!customRangeError}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 print:hidden"
          >
            {isForceRefreshing ? "重算中..." : "立即更新（從資料庫重算）"}
          </button>
          <button
            type="button"
            onClick={openBrowserPrintForPdf}
            disabled={loading}
            title="會開啟列印視窗，請選擇「另存為 PDF」"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 print:hidden"
          >
            另存 PDF（列印）
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">總營收</p>
            <InfoPopover
              title="總營收"
              lines={[
                "計算方式：加總所有訂單金額（不含已取消訂單）",
                "統計範圍：目前篩選期間、目前分店/全部分店內的有效訂單",
                "更新頻率：API 請求時（TTL 5 分鐘快取）",
              ]}
            />
          </div>
          <p className="text-lg font-semibold text-slate-900 sm:text-xl">{money(data.summary.totalRevenue)}</p>
        </Card>
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">總訂單</p>
            <InfoPopover
              title="總訂單"
              lines={[
                "計算方式：訂單筆數總計",
                "統計範圍：目前篩選期間、目前分店/全部分店內所有訂單（含已取消）",
                "更新頻率：API 請求時（TTL 5 分鐘快取）",
              ]}
            />
          </div>
          <p className="text-lg font-semibold text-slate-900 sm:text-xl">{data.summary.totalOrders}</p>
        </Card>
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">平均客單價</p>
            <InfoPopover
              title="平均客單價"
              lines={[
                "計算方式：總營收 ÷ 有效訂單數（不含已取消訂單）",
                "統計範圍：目前篩選期間、目前分店/全部分店內有效訂單",
                "更新頻率：API 請求時（TTL 5 分鐘快取）",
              ]}
            />
          </div>
          <p className="text-lg font-semibold text-slate-900 sm:text-xl">{money(data.summary.avgOrderValue)}</p>
        </Card>
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">取消率</p>
            <InfoPopover
              title="取消率"
              lines={[
                "計算方式：已取消訂單數 ÷ 總訂單數",
                "統計範圍：目前篩選期間、目前分店/全部分店內所有訂單",
                "更新頻率：API 請求時（TTL 5 分鐘快取）",
              ]}
            />
          </div>
          <p className="text-lg font-semibold text-rose-700 sm:text-xl">{pct(data.summary.cancelRate)}</p>
        </Card>
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">逾時率</p>
            <InfoPopover
              title="逾時率"
              lines={[
                "計算方式：實際完成時間晚於預估完成時間的訂單數 ÷ 可比較訂單數",
                "統計範圍：同時有「預估完成時間」與「實際完成時間」的訂單",
                "更新頻率：API 請求時（TTL 5 分鐘快取）",
              ]}
            />
          </div>
          <p className="text-lg font-semibold text-amber-700 sm:text-xl">{pct(data.summary.overtimeRate)}</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">銷售尖峰時段（銷量）</p>
            <InfoPopover
              title="銷售尖峰時段（銷量）"
              lines={[
                "這張圖用來看一天 24 小時中，哪幾個時段賣得最多。",
                "柱高代表該時段售出總份數（不是金額）。",
                "可用於排班與備料時段調整。",
              ]}
            />
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportPeakHourCsv}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 CSV
            </button>
            <button
              type="button"
              onClick={() => exportChartPng(peakHourChartInstanceRef.current, `peak-hours-${Date.now()}.png`)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 PNG
            </button>
          </div>
          <div className="h-[220px] sm:h-[280px]">
            <ReactECharts
              option={peakHourOption}
              style={{ height: "100%" }}
              onChartReady={(instance: any) => {
                peakHourChartInstanceRef.current = instance;
              }}
            />
          </div>
        </Card>
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">營收 / 訂單趨勢</p>
            <InfoPopover
              title="營收 / 訂單趨勢"
              lines={[
                "這張圖用來看選定期間內每日變化。",
                "折線為每日營收，柱狀為每日訂單數。",
                "可快速辨識活動檔期、淡旺日與異常波動。",
              ]}
            />
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportSalesTrendCsv}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 CSV
            </button>
            <button
              type="button"
              onClick={() =>
                exportChartPng(salesTrendChartInstanceRef.current, `sales-trend-${Date.now()}.png`)
              }
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 PNG
            </button>
          </div>
          <div className="h-[220px] sm:h-[280px]">
            <ReactECharts
              option={salesTrendOption}
              style={{ height: "100%" }}
              onChartReady={(instance: any) => {
                salesTrendChartInstanceRef.current = instance;
              }}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">支付方式占比</p>
            <InfoPopover
              title="支付方式占比"
              lines={[
                "這張圖顯示各支付方式的訂單筆數占比。",
                "目前以筆數計算（不是支付金額占比）。",
                "可用於判斷現金/刷卡使用習慣。",
              ]}
            />
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportPaymentCsv}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 CSV
            </button>
            <button
              type="button"
              onClick={() => exportChartPng(paymentChartInstanceRef.current, `payment-share-${Date.now()}.png`)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 PNG
            </button>
          </div>
          <div className="h-[250px] sm:h-[280px]">
            <ReactECharts
              option={paymentOption}
              style={{ height: "100%" }}
              onChartReady={(instance: any) => {
                paymentChartInstanceRef.current = instance;
              }}
            />
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">銷量排行榜</p>
            <InfoPopover
              title="銷量排行榜"
              lines={[
                "這張表列出目前區間內賣最多的商品。",
                "排序依售出份數（由高到低）。",
                "可用來決定主打品、備料優先順序。",
              ]}
            />
          </div>
          <div className="mb-2">
            <button
              type="button"
              onClick={exportTopProductsCsv}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 CSV
            </button>
          </div>
          <div className="space-y-2">
            {data.charts.topProducts.length === 0 ? (
              <p className="text-sm text-slate-500">無資料</p>
            ) : (
              data.charts.topProducts.slice(0, 8).map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  className="flex items-center justify-between rounded border border-slate-100 px-2 py-1.5 text-sm"
                >
                  <span className="truncate text-slate-700">
                    {idx + 1}. {item.name}
                  </span>
                  <span className="ml-2 shrink-0 font-medium text-slate-900">{item.quantity}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">熱門種類</p>
            <InfoPopover
              title="熱門種類"
              lines={[
                "這張表把商品按分類彙總後比較熱度。",
                "排序依該分類總售出份數（由高到低）。",
                "可用於調整菜單結構與促銷重點。",
              ]}
            />
          </div>
          <div className="mb-2">
            <button
              type="button"
              onClick={exportTopCategoriesCsv}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 CSV
            </button>
          </div>
          <div className="space-y-2">
            {data.charts.topCategories.length === 0 ? (
              <p className="text-sm text-slate-500">無資料</p>
            ) : (
              data.charts.topCategories.slice(0, 8).map((item, idx) => (
                <div
                  key={`${item.category}-${idx}`}
                  className="flex items-center justify-between rounded border border-slate-100 px-2 py-1.5 text-sm"
                >
                  <span className="truncate text-slate-700">
                    {idx + 1}. {item.category}
                  </span>
                  <span className="ml-2 shrink-0 font-medium text-slate-900">{item.quantity}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-800">最佳銷售人員</p>
              <InfoPopover
                title="最佳銷售人員"
                lines={[
                  "這張表用來比較不同建單人員的表現。",
                  "可用上方切換依營收或依單數排序。",
                  "每列顯示該人員的總營收與單數。",
                ]}
              />
            </div>
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setStaffSortBy("revenue")}
                className={`rounded px-2.5 py-1 text-xs ${
                  staffSortBy === "revenue"
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                依營收
              </button>
              <button
                type="button"
                onClick={() => setStaffSortBy("orders")}
                className={`rounded px-2.5 py-1 text-xs ${
                  staffSortBy === "orders"
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                依單數
              </button>
            </div>
          </div>
          <div className="mb-2">
            <button
              type="button"
              onClick={exportStaffRankingCsv}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 CSV
            </button>
          </div>
          <div className="space-y-2">
            {sortedStaffRanking.length === 0 ? (
              <p className="text-sm text-slate-500">目前沒有 POS 建單人資料。</p>
            ) : (
              sortedStaffRanking.map((item, idx) => (
                <div
                  key={item.userId}
                  className="flex items-center justify-between rounded border border-slate-100 px-2 py-1.5 text-sm"
                >
                  <span className="truncate text-slate-700">
                    {idx + 1}. {item.name}
                  </span>
                  <span className="ml-2 shrink-0 font-medium text-slate-900">
                    {money(item.revenue)} / {item.orderCount} 單
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">庫存消耗速度（推估 Top 10）</p>
            <InfoPopover
              title="庫存消耗速度（推估 Top 10）"
              lines={[
                "這張表用來估算原料消耗速度與可用天數。",
                "日耗 = 期間總推估消耗 ÷ 天數；可用天數 = 現有庫存 ÷ 日耗。",
                "屬於配方推估，不含人工盤點、報廢、補貨調整。",
              ]}
            />
          </div>
          <div className="mb-2">
            <button
              type="button"
              onClick={exportInventoryBurnCsv}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 CSV
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              照最近賣法，這個原料消耗速度多快、庫存大約還能撐多久（依配方推估）。
            </p>
            {data.charts.inventoryBurn.length === 0 ? (
              <p className="text-sm text-slate-500">無法估算（缺少配方或銷售資料）。</p>
            ) : (
              data.charts.inventoryBurn.map((item) => (
                <div
                  key={item.ingredientId}
                  className="rounded border border-slate-100 px-2 py-1.5 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{item.ingredientName}</span>
                    <span className="text-slate-600">
                      日耗 {item.dailyUsage} {item.unit}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    現有 {item.currentStock} {item.unit}
                    {item.estimatedDaysLeft != null
                      ? `，約可用 ${item.estimatedDaysLeft} 天`
                      : "，目前無法估算可用天數"}
                  </p>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextOpen =
                          expandedIngredientId === item.ingredientId ? null : item.ingredientId;
                        setExpandedIngredientId(nextOpen);
                        if (nextOpen) void fetchInventoryDetail(item.ingredientId);
                      }}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {expandedIngredientId === item.ingredientId ? "收合計算明細" : "查看計算明細"}
                    </button>
                  </div>
                  {expandedIngredientId === item.ingredientId && (
                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-1 text-slate-600">
                          <input
                            type="checkbox"
                            checked={detailOnlyActive}
                            onChange={(e) => {
                              const nextOnlyActive = e.target.checked;
                              setDetailOnlyActive(nextOnlyActive);
                              void fetchInventoryDetail(item.ingredientId, nextOnlyActive);
                            }}
                          />
                          僅看未取消訂單
                        </label>
                        {(() => {
                          const detail = inventoryDetailById[
                            `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                          ];
                          if (!detail) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => exportInventoryDetailCsv(detail)}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                            >
                              匯出 CSV
                            </button>
                          );
                        })()}
                      </div>
                      {inventoryDetailLoadingId === item.ingredientId ? (
                        <p className="text-slate-500">明細載入中...</p>
                      ) : inventoryDetailById[
                          `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                        ] ? (
                        <>
                          {(() => {
                            const detail =
                              inventoryDetailById[
                                `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                              ];
                            return (
                              <>
                                {detail.formulaSummary && (
                                  <p className="mb-1 text-slate-600">
                                    <span className="font-medium text-slate-700">公式摘要：</span>
                                    {detail.formulaSummary}
                                  </p>
                                )}
                                {detail.assumptions && detail.assumptions.length > 0 && (
                                  <div className="mb-1 space-y-0.5 text-slate-500">
                                    {detail.assumptions.map((a, idx) => (
                                      <p key={`${detail.ingredientId}-assumption-${idx}`}>- {a}</p>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          <p className="font-medium text-slate-700">
                            總推估消耗：
                            {inventoryDetailById[
                              `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                            ].totalConsumed.toFixed(2)}{" "}
                            {
                              inventoryDetailById[
                                `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                              ].unit
                            }
                          </p>
                          <div className="mt-1">
                            <p className="font-medium text-slate-600">商品貢獻</p>
                            {inventoryDetailById[
                              `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                            ].contributors.length === 0 ? (
                              <p className="text-slate-500">無資料</p>
                            ) : (
                              inventoryDetailById[
                                `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                              ].contributors.map((c, idx) => (
                                <p key={`${c.name}-${idx}`} className="text-slate-600">
                                  {idx + 1}. {c.name}：{c.consumed.toFixed(2)} {item.unit}（售出 {c.quantity} 份）
                                </p>
                              ))
                            )}
                          </div>
                          <div className="mt-1">
                            <p className="font-medium text-slate-600">客製化貢獻</p>
                            {inventoryDetailById[
                              `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                            ].customizationContributors.length === 0 ? (
                              <p className="text-slate-500">無資料</p>
                            ) : (
                              inventoryDetailById[
                                `${item.ingredientId}:${detailOnlyActive ? "active" : "all"}`
                              ].customizationContributors.map((c, idx) => (
                                <p key={`${c.label}-${idx}`} className="text-slate-600">
                                  {idx + 1}. {c.label}：{c.consumed.toFixed(2)} {item.unit}
                                </p>
                              ))
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-slate-500">無明細資料</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {data.role === "OWNER" && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold text-slate-800">分店比較（Owner）</p>
            <InfoPopover
              title="分店比較（Owner）"
              lines={[
                "這張圖用來比較各分店在同一區間的營運表現。",
                "柱狀圖主軸是營收，列表同步顯示訂單、取消率、逾時率。",
                "可直接點擊分店進入 drill-down 明細頁。",
              ]}
            />
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportStoreComparisonCsv}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 CSV
            </button>
            <button
              type="button"
              onClick={() =>
                exportChartPng(
                  storeComparisonChartInstanceRef.current,
                  `store-comparison-${Date.now()}.png`
                )
              }
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              匯出 PNG
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            可直接點柱狀圖或列表列進入分店 drill-down 明細頁
          </p>
          <div className="h-[220px] sm:h-[260px]">
            <ReactECharts
              option={storeComparisonOption}
              style={{ height: "100%" }}
              onChartReady={(instance: any) => {
                storeComparisonChartInstanceRef.current = instance;
              }}
              onEvents={{
                click: (params: { dataIndex?: number }) => {
                  if (typeof params?.dataIndex !== "number") return;
                  const hit = data.charts.storeComparison[params.dataIndex];
                  if (!hit) return;
                  router.push(`${dashboardBasePath}/stores/${hit.storeId}?days=${days}`);
                },
              }}
            />
          </div>
          <div className="mt-3 space-y-2">
            {data.charts.storeComparison.map((store) => (
              <button
                type="button"
                key={store.storeId}
                onClick={() =>
                  router.push(`${dashboardBasePath}/stores/${store.storeId}?days=${days}`)
                }
                className="grid w-full gap-1 rounded border border-slate-100 p-2 text-left text-sm transition hover:bg-slate-50 md:grid-cols-5"
              >
                <span className="font-medium text-slate-800">{store.storeName}</span>
                <span className="text-slate-600">營收：{money(store.revenue)}</span>
                <span className="text-slate-600">訂單：{store.orders}</span>
                <span className="text-slate-600">取消率：{pct(store.cancelRate)}</span>
                <span className="text-slate-600">逾時率：{pct(store.overtimeRate)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
