"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { FullScreenLoading } from "@/components/ui/FullScreenLoading";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Role } from "@/lib/types";

type InventoryRow = {
  id?: string;
  name: string;
  unit: string;
  quantity: number;
  deleted?: boolean;
  isNew?: boolean;
  isEditing?: boolean;
};

export default function InventoryPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const isManagerOrStaff = role === Role.MANAGER || role === Role.STAFF;

  const createTempId = () => {
    // 新增原料時用穩定的 key，避免 React remount 造成畫面高度抖動
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/inventory");
        if (!res.ok) {
          throw new Error("載入庫存資料失敗");
        }
        const data = (await res.json()) as {
          items: { id: string; name: string; unit: string; quantity: number }[];
        };
        setRows(
          data.items.map((item) => ({
            id: item.id,
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
            isEditing: false,
          }))
        );
      } catch (err) {
        console.error(err);
        setError("無法載入庫存資料，請稍後再試。");
      } finally {
        setLoading(false);
        setDirty(false);
      }
    };

    if (role) {
      void load();
    } else {
      setLoading(false);
    }
  }, [role]);

  const handleChangeRow = (
    index: number,
    field: "name" | "unit" | "quantity",
    value: string
  ) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      if (field === "quantity") {
        row.quantity = Number(value) || 0;
      } else {
        (row as any)[field] = value;
      }
      next[index] = row;
      return next;
    });
    setDirty(true);
  };

  const handleToggleDelete = (index: number) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      row.deleted = !row.deleted;
      next[index] = row;
      return next;
    });
    setDirty(true);
  };

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: createTempId(),
        name: "",
        unit: "份",
        quantity: 0,
        isNew: true,
        isEditing: true,
      },
    ]);
    setDirty(true);
  };

  const handleToggleEdit = (index: number) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      row.isEditing = !row.isEditing;
      next[index] = row;
      return next;
    });
  };

  const [demandByIngredient, setDemandByIngredient] = useState<
    Record<string, number>
  >({});
  const [demandLoading, setDemandLoading] = useState(true);

  const loadingOverlay = useMemo(() => {
    if (saving) {
      return {
        open: true as const,
        title: "儲存中",
        description: "正在更新庫存…",
      };
    }
    if (loading && demandLoading) {
      return {
        open: true as const,
        title: "載入中",
        description: "正在載入庫存與菜單需求資料…",
      };
    }
    if (loading) {
      return {
        open: true as const,
        title: "載入中",
        description: "正在載入庫存…",
      };
    }
    if (demandLoading) {
      return {
        open: true as const,
        title: "載入中",
        description: "正在計算菜單需求…",
      };
    }
    return {
      open: false as const,
      title: "",
      description: undefined as string | undefined,
    };
  }, [saving, loading, demandLoading]);

  useEffect(() => {
    const loadDemand = async () => {
      setDemandLoading(true);
      try {
        const res = await fetch("/api/menu");
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: {
            id: string;
            name: string;
            dailyLimit: number;
            recipe?: { ingredientId: string; quantity: number }[];
            customizations?: {
              id: string;
              label: string;
              maxQuantity: number;
              recipe?: { ingredientId: string; quantity: number }[];
            }[];
          }[];
        };

        const demand: Record<string, number> = {};

        for (const item of data.items ?? []) {
          const dailyLimit = Number.isFinite(item.dailyLimit)
            ? Math.max(0, Math.floor(item.dailyLimit))
            : 0;
          if (dailyLimit <= 0) continue;

          for (const r of item.recipe ?? []) {
            if (!r.ingredientId || !Number.isFinite(r.quantity)) continue;
            const qty = Math.max(0, Math.floor(r.quantity));
            demand[r.ingredientId] =
              (demand[r.ingredientId] ?? 0) + qty * dailyLimit;
          }

          for (const c of item.customizations ?? []) {
            const maxQ = Number.isFinite(c.maxQuantity)
              ? Math.max(0, Math.floor(c.maxQuantity))
              : 0;
            if (maxQ <= 0) continue;
            for (const r of c.recipe ?? []) {
              if (!r.ingredientId || !Number.isFinite(r.quantity)) continue;
              const qty = Math.max(0, Math.floor(r.quantity));
              demand[r.ingredientId] =
                (demand[r.ingredientId] ?? 0) + qty * dailyLimit * maxQ;
            }
          }
        }

        setDemandByIngredient(demand);
      } catch (err) {
        console.error(err);
      } finally {
        setDemandLoading(false);
      }
    };

    if (role) {
      void loadDemand();
    } else {
      setDemandLoading(false);
    }
  }, [role]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          unit: row.unit || "份",
          quantity: row.quantity,
          deleted: row.deleted ?? false,
        })),
      };

      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("儲存失敗");
      }

      const data = (await res.json()) as {
        items: { id: string; name: string; unit: string; quantity: number }[];
      };

      setRows(
        data.items.map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
        }))
      );
      setDirty(false);
    } catch (err) {
      console.error(err);
      setError("儲存失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <FullScreenLoading
        open={loadingOverlay.open}
        title={loadingOverlay.title}
        description={loadingOverlay.description}
      />
      <h2 className="text-xl font-semibold text-slate-900">原料庫存管理</h2>

      {!isManagerOrStaff && (
        <Card>
          <p className="text-sm text-slate-600">
            您目前的角色為 {role ?? "未知"}，僅分店長與店員可以管理原料庫存。
          </p>
        </Card>
      )}

      {isManagerOrStaff && (
        <Card title="目前原料庫存總覽">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-600">
              在此新增、刪除或調整原料與庫存數量，按下「儲存變更」後，菜單管理與點餐系統會共用這份資料。
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                disabled={loading}
              >
                新增原料
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!dirty || saving || loading}
              >
                {saving ? "儲存中..." : "儲存變更"}
              </Button>
            </div>
          </div>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <div className="overflow-x-auto">
            {loading ? (
              <table className="min-w-[820px] table-fixed border border-slate-200 bg-white text-xs sm:w-full sm:min-w-0 sm:text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="w-[220px] sm:w-[36%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      原料名稱
                    </th>
                    <th className="w-[90px] sm:w-[12%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      單位
                    </th>
                    <th className="w-[140px] sm:w-[16%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      目前庫存
                    </th>
                    <th className="w-[240px] sm:w-[22%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      菜單需求
                    </th>
                    <th className="w-[130px] sm:w-[14%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="w-[220px] sm:w-[36%] px-4 py-2 min-h-[44px]">
                        <div className="h-5 w-28 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td className="w-[90px] sm:w-[12%] px-4 py-2 min-h-[44px]">
                        <div className="h-5 w-10 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td className="w-[140px] sm:w-[16%] px-4 py-2 min-h-[44px]">
                        <div className="h-5 w-14 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td className="w-[240px] sm:w-[22%] px-4 py-2 min-h-[52px]">
                        <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                        <div className="mt-1 h-3 w-24 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td className="w-[130px] sm:w-[14%] px-4 py-2 min-h-[44px]">
                        <div className="h-7 w-28 animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="min-w-[820px] table-fixed border border-slate-200 bg-white text-xs sm:w-full sm:min-w-0 sm:text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="w-[220px] sm:w-[36%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      原料名稱
                    </th>
                    <th className="w-[90px] sm:w-[12%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      單位
                    </th>
                    <th className="w-[140px] sm:w-[16%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      目前庫存
                    </th>
                    <th className="w-[240px] sm:w-[22%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      菜單需求
                    </th>
                    <th className="w-[130px] sm:w-[14%] border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={row.id ?? `new-${index}`}
                      className={`border-b border-slate-100 ${
                        row.deleted ? "bg-red-50/40 text-slate-400" : ""
                      }`}
                    >
                      <td className="w-[220px] sm:w-[36%] px-4 py-2 min-h-[44px]">
                        {row.isEditing ? (
                          <input
                            type="text"
                            className="h-9 w-full rounded-md border border-slate-200 px-2 py-0 text-xs sm:text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            value={row.name}
                            onChange={(e) =>
                              handleChangeRow(index, "name", e.target.value)
                            }
                            placeholder="例如：麵糊"
                          />
                        ) : (
                          <div className="flex h-9 w-full items-center">
                            <span className="truncate text-xs sm:text-sm text-slate-800">
                              {row.name || (
                                <span className="text-slate-400">尚未命名</span>
                              )}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="w-[90px] sm:w-[12%] px-4 py-2 min-h-[44px]">
                        {row.isEditing ? (
                          <input
                            type="text"
                            className="h-9 w-full rounded-md border border-slate-200 px-2 py-0 text-xs sm:text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            value={row.unit}
                            onChange={(e) =>
                              handleChangeRow(index, "unit", e.target.value)
                            }
                            placeholder="份"
                          />
                        ) : (
                          <div className="flex h-9 items-center">
                            <span className="truncate block w-full text-xs sm:text-sm text-slate-800">
                              {row.unit || (
                                <span className="text-slate-400">份</span>
                              )}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="w-[140px] sm:w-[16%] px-4 py-2 min-h-[44px]">
                        {row.isEditing ? (
                          <div className="flex h-9 items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              className="h-9 w-full rounded-md border border-slate-200 px-2 py-0 text-xs sm:text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              value={row.quantity}
                              onChange={(e) =>
                                handleChangeRow(
                                  index,
                                  "quantity",
                                  e.target.value
                                )
                              }
                            />
                            <span className="text-xs text-slate-500">
                              {row.unit || "份"}
                            </span>
                          </div>
                        ) : (
                          <div className="flex h-9 items-center">
                            <span className="whitespace-nowrap text-xs sm:text-sm text-slate-800">
                              {row.quantity} {row.unit || "份"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="w-[240px] sm:w-[22%] px-4 py-2 min-h-[52px]">
                        {row.id && demandByIngredient[row.id] != null ? (
                          <div className="min-h-[52px] text-xs">
                            <p
                              className={
                                row.quantity < demandByIngredient[row.id]
                                  ? "font-medium text-red-600"
                                  : "text-slate-600"
                              }
                            >
                              菜單最大需求約 {demandByIngredient[row.id]}{" "}
                              {row.unit || "份"}/天
                            </p>
                            <p
                              className={`mt-0.5 text-[11px] text-red-500 ${
                                row.quantity < demandByIngredient[row.id]
                                  ? ""
                                  : "invisible"
                              }`}
                            >
                              目前庫存可能不足，請留意補貨。
                            </p>
                          </div>
                        ) : (
                          <div className="min-h-[52px] text-xs">
                            <p className="text-xs text-slate-400">—</p>
                            <p className="mt-0.5 text-[11px] text-red-500 invisible">
                              目前庫存可能不足，請留意補貨。
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="w-[130px] sm:w-[14%] px-4 py-2 min-h-[44px]">
                        <div className="flex flex-nowrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => handleToggleEdit(index)}
                          >
                            {row.isEditing ? "完成" : "編輯"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleToggleDelete(index)}
                            className="rounded-md px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
                          >
                            {row.deleted ? "還原" : "標記刪除"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
