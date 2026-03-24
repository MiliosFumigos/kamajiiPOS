"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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

  const [demandByIngredient, setDemandByIngredient] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadDemand = async () => {
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
            demand[r.ingredientId] = (demand[r.ingredientId] ?? 0) + qty * dailyLimit;
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
      }
    };

    if (role) {
      void loadDemand();
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
          {loading ? (
            <p className="text-sm text-slate-500">載入中...</p>
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-slate-600">
                  在此新增、刪除或調整原料與庫存數量，按下「儲存變更」後，菜單管理與點餐系統會共用這份資料。
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleAddRow}>
                    新增原料
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!dirty || saving}
                  >
                    {saving ? "儲存中..." : "儲存變更"}
                  </Button>
                </div>
              </div>
              {error && (
                <p className="mb-2 text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full border border-slate-200 bg-white text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                        原料名稱
                      </th>
                      <th className="border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                        單位
                      </th>
                      <th className="border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                        目前庫存
                      </th>
                      <th className="border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
                        菜單需求
                      </th>
                      <th className="border-b border-slate-200 px-4 py-2 text-left font-medium text-slate-600">
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
                        <td className="px-4 py-2">
                          {row.isEditing ? (
                            <input
                              type="text"
                              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              value={row.name}
                              onChange={(e) =>
                                handleChangeRow(index, "name", e.target.value)
                              }
                              placeholder="例如：麵糊"
                            />
                          ) : (
                            <span className="text-sm text-slate-800">
                              {row.name || (
                                <span className="text-slate-400">尚未命名</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {row.isEditing ? (
                            <input
                              type="text"
                              className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              value={row.unit}
                              onChange={(e) =>
                                handleChangeRow(index, "unit", e.target.value)
                              }
                              placeholder="份"
                            />
                          ) : (
                            <span className="text-sm text-slate-800">
                              {row.unit || <span className="text-slate-400">份</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {row.isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                className="w-28 rounded-md border border-slate-200 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                value={row.quantity}
                                onChange={(e) =>
                                  handleChangeRow(index, "quantity", e.target.value)
                                }
                              />
                              <span className="text-xs text-slate-500">
                                {row.unit || "份"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-800">
                              {row.quantity} {row.unit || "份"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {row.id && demandByIngredient[row.id] != null ? (
                            <div className="text-xs">
                              <p
                                className={
                                  row.quantity < demandByIngredient[row.id]
                                    ? "font-medium text-red-600"
                                    : "text-slate-600"
                                }
                              >
                                菜單最大需求約{" "}
                                {demandByIngredient[row.id]} {row.unit || "份"}/天
                              </p>
                              {row.quantity < demandByIngredient[row.id] && (
                                <p className="mt-0.5 text-[11px] text-red-500">
                                  目前庫存可能不足，請留意補貨。
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
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
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

