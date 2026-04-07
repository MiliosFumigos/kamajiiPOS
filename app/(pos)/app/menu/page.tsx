"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Role } from "@/lib/types";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
};

type RecipeLine = {
  ingredientId: string;
  quantity: number;
};

type CustomizationOption = {
  id?: string;
  label: string;
  priceDelta: number;
  maxQuantity: number;
  recipe?: RecipeLine[];
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  dailyLimit: number;
  prepMinutes: number;
  imageUrl?: string;
  recipe: RecipeLine[];
  categories: string[];
  customizations: CustomizationOption[];
};

function MenuPreviewCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* 固定高度圖片區：避免有/無圖片時造成 CLS */}
      <div className="h-32 w-full animate-pulse bg-slate-100" />
      <div className="space-y-2 p-4">
        <div className="h-5 w-36 rounded bg-slate-100 animate-pulse" />
        <div className="h-3 w-44 rounded bg-slate-100 animate-pulse" />
        <div className="mt-1 flex flex-wrap gap-1">
          <div className="h-5 w-16 rounded-full bg-slate-100 animate-pulse" />
          <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" />
          <div className="h-5 w-14 rounded-full bg-slate-100 animate-pulse" />
        </div>
        <div className="space-y-1 pt-1">
          <div className="h-3 w-28 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-32 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-24 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function InventoryDemandCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between">
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-4 w-40 rounded bg-slate-100 animate-pulse" />
        <div className="h-3 w-28 rounded bg-slate-100 animate-pulse" />
      </div>
      <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-end">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-10 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-10 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="text-right text-xs space-y-2">
          <div className="h-3 w-44 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-36 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function AppMenuPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingMode, setEditingMode] = useState(false);
  const [categoryInput, setCategoryInput] = useState("");

  const [newItem, setNewItem] = useState<
    Omit<MenuItem, "id" | "recipe" | "customizations"> & {
      recipe: RecipeLine[];
      customizations: CustomizationOption[];
    }
  >({
    name: "",
    price: 60,
    dailyLimit: 50,
    prepMinutes: 3,
    imageUrl: "",
    recipe: [],
    categories: [],
    customizations: [],
  });

  const isManagerOrStaff = role === Role.MANAGER || role === Role.STAFF;

  useEffect(() => {
    const loadInventory = async () => {
      setInventoryLoading(true);
      setInventoryError(null);
      try {
        const res = await fetch("/api/inventory");
        if (!res.ok) {
          throw new Error("載入庫存失敗");
        }
        const data = (await res.json()) as {
          items: { id: string; name: string; unit: string; quantity: number }[];
        };
        setIngredients(
          data.items.map((item) => ({
            id: item.id,
            name: item.name,
            unit: item.unit,
          }))
        );
        setInventory(
          data.items.reduce<Record<string, number>>((acc, item) => {
            acc[item.id] = item.quantity;
            return acc;
          }, {})
        );
      } catch (err) {
        console.error(err);
        setInventoryError("無法載入庫存資料，請稍後再試。");
        setIngredients([]);
        setInventory({});
      } finally {
        setInventoryLoading(false);
      }
    };
    const loadMenu = async () => {
      setMenuLoading(true);
      setMenuError(null);
      try {
        const res = await fetch("/api/menu");
        if (!res.ok) {
          throw new Error("載入菜單失敗");
        }
        const data = (await res.json()) as { items: MenuItem[] };
        setMenuItems(data.items);
      } catch (err) {
        console.error(err);
        setMenuError("無法載入菜單，請稍後再試。");
        setMenuItems([]);
      } finally {
        setMenuLoading(false);
      }
    };

    void loadInventory();
    void loadMenu();
  }, []);

  const requiredInventory = useMemo(() => {
    const map = new Map<string, number>();
    menuItems.forEach((item) => {
      item.recipe.forEach((line) => {
        const current = map.get(line.ingredientId) || 0;
        map.set(line.ingredientId, current + line.quantity * item.dailyLimit);
      });
    });
    return map;
  }, [menuItems]);

  const handleRecipeChange = (
    index: number,
    field: "ingredientId" | "quantity",
    value: string
  ) => {
    setNewItem((prev) => {
      const recipe = [...prev.recipe];
      if (field === "ingredientId") {
        recipe[index] = { ...recipe[index], ingredientId: value };
      } else {
        recipe[index] = { ...recipe[index], quantity: Number(value) || 0 };
      }
      return { ...prev, recipe };
    });
  };

  const addRecipeLine = () => {
    setNewItem((prev) => ({
      ...prev,
      recipe: [
        ...prev.recipe,
        {
          ingredientId: ingredients[0]?.id ?? "",
          quantity: 1,
        },
      ],
    }));
  };

  const removeRecipeLine = (index: number) => {
    setNewItem((prev) => ({
      ...prev,
      recipe: prev.recipe.filter((_, i) => i !== index),
    }));
  };

  const handleAddCategory = () => {
    const value = categoryInput.trim();
    if (!value) return;
    setNewItem((prev) => ({
      ...prev,
      categories: prev.categories.includes(value)
        ? prev.categories
        : [...prev.categories, value],
    }));
    setCategoryInput("");
  };

  const handleRemoveCategory = (value: string) => {
    setNewItem((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c !== value),
    }));
  };

  const handleCustomizationChange = (
    index: number,
    field: "label" | "priceDelta" | "maxQuantity",
    value: string
  ) => {
    setNewItem((prev) => {
      const customizations = [...prev.customizations];
      const current = customizations[index] ?? {
        label: "",
        priceDelta: 0,
        maxQuantity: 1,
        recipe: [],
      };
      if (field === "label") {
        customizations[index] = { ...current, label: value };
      } else if (field === "priceDelta") {
        customizations[index] = {
          ...current,
          priceDelta: Number(value) || 0,
        };
      } else {
        customizations[index] = {
          ...current,
          maxQuantity: Number(value) || 1,
        };
      }
      return { ...prev, customizations };
    });
  };

  const addCustomizationLine = () => {
    setNewItem((prev) => ({
      ...prev,
      customizations: [
        ...prev.customizations,
        { label: "", priceDelta: 0, maxQuantity: 1, recipe: [] },
      ],
    }));
  };

  const handleCustomizationRecipeChange = (
    customizationIndex: number,
    lineIndex: number,
    field: "ingredientId" | "quantity",
    value: string
  ) => {
    setNewItem((prev) => {
      const customizations = [...prev.customizations];
      const current = customizations[customizationIndex] ?? {
        label: "",
        priceDelta: 0,
        maxQuantity: 1,
        recipe: [],
      };
      const recipe = [...(current.recipe ?? [])];
      if (field === "ingredientId") {
        recipe[lineIndex] = { ...recipe[lineIndex], ingredientId: value };
      } else {
        recipe[lineIndex] = {
          ...recipe[lineIndex],
          quantity: Number(value) || 0,
        };
      }
      customizations[customizationIndex] = { ...current, recipe };
      return { ...prev, customizations };
    });
  };

  const addCustomizationRecipeLine = (customizationIndex: number) => {
    setNewItem((prev) => {
      const customizations = [...prev.customizations];
      const current = customizations[customizationIndex] ?? {
        label: "",
        priceDelta: 0,
        maxQuantity: 1,
        recipe: [],
      };
      const recipe = [
        ...(current.recipe ?? []),
        {
          ingredientId: ingredients[0]?.id ?? "",
          quantity: 1,
        },
      ];
      customizations[customizationIndex] = { ...current, recipe };
      return { ...prev, customizations };
    });
  };

  const removeCustomizationRecipeLine = (
    customizationIndex: number,
    lineIndex: number
  ) => {
    setNewItem((prev) => {
      const customizations = [...prev.customizations];
      const current = customizations[customizationIndex];
      if (!current) return prev;
      const recipe = (current.recipe ?? []).filter(
        (_, i) => i !== lineIndex
      );
      customizations[customizationIndex] = { ...current, recipe };
      return { ...prev, customizations };
    });
  };

  const removeCustomizationLine = (index: number) => {
    setNewItem((prev) => ({
      ...prev,
      customizations: prev.customizations.filter((_, i) => i !== index),
    }));
  };

  const handleCreateMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManagerOrStaff) return;

    setSaving(true);
    setMenuError(null);

    try {
      const payload = {
        name: newItem.name.trim(),
        price: newItem.price,
        dailyLimit: newItem.dailyLimit,
        prepMinutes: newItem.prepMinutes,
        imageUrl: newItem.imageUrl?.trim() || null,
        recipe: newItem.recipe.filter(
          (r) => r.ingredientId && Number.isFinite(r.quantity) && r.quantity > 0
        ),
        categories: newItem.categories,
        customizations: newItem.customizations
          .filter((c) => c.label.trim() && c.maxQuantity > 0)
          .map((c) => ({
            label: c.label,
            priceDelta: c.priceDelta,
            maxQuantity: c.maxQuantity,
            recipe: (c.recipe ?? []).filter(
              (r) =>
                r.ingredientId && Number.isFinite(r.quantity) && r.quantity > 0
            ),
          })),
      };

      const res = await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("儲存菜單失敗");
      }

      const data = (await res.json()) as { items: MenuItem[] };
      setMenuItems(data.items);
      setNewItem((prev) => ({
        ...prev,
        name: "",
        imageUrl: "",
        recipe: [],
        categories: [],
        customizations: [],
      }));
      setCategoryInput("");
    } catch (err) {
      console.error(err);
      setMenuError("儲存菜單失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMenuItem = async (id: string) => {
    if (!isManagerOrStaff) return;

    const ok = window.confirm("確定要刪除此菜單品項嗎？");
    if (!ok) return;

    setSaving(true);
    setMenuError(null);

    try {
      const res = await fetch(`/api/menu?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("刪除失敗");
      }
      const data = (await res.json()) as { items: MenuItem[] };
      setMenuItems(data.items);
    } catch (err) {
      console.error(err);
      setMenuError("刪除失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900">
        菜單管理（每日可販售品項）
      </h2>

      {!isManagerOrStaff && (
        <Card>
          <p className="text-sm text-slate-600">
            您目前的角色為 {role ?? "未知"}，僅分店長與店員可以建立或調整每日菜單。
          </p>
        </Card>
      )}

      {isManagerOrStaff && (
        <Card title="建立今日可販售商品">
          <form
            onSubmit={handleCreateMenuItem}
            className="grid gap-4 md:grid-cols-2"
          >
            <div className="space-y-4">
              <Input
                label="商品名稱"
                value={newItem.name}
                onChange={(e) =>
                  setNewItem({ ...newItem, name: e.target.value })
                }
                placeholder="例如：卡士達雞蛋糕"
                required
              />
              <Input
                label="商品圖片網址（暫時）"
                value={newItem.imageUrl}
                onChange={(e) =>
                  setNewItem({ ...newItem, imageUrl: e.target.value })
                }
                placeholder="可先貼上圖片 URL，之後再接上傳"
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="售價（元）"
                  type="number"
                  min={0}
                  value={newItem.price}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      price: Number(e.target.value) || 0,
                    })
                  }
                  required
                />
                <div className="w-full">
                  <label className="mb-1 block min-h-[1.25rem] w-full truncate text-sm font-medium text-slate-700 leading-tight">
                    今日可販售數量（份）
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={newItem.dailyLimit}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        dailyLimit: Number(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  商品種類（標籤）
                </label>
                <div className="flex items-stretch gap-2">
                  <Input
                    label=""
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    placeholder="例如：甜點、強烈推薦"
                    className="h-8 py-0 px-3 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCategory}
                    disabled={!categoryInput.trim()}
                    className="shrink-0 whitespace-nowrap border-brand-500/20 text-brand-700 hover:bg-brand-50"
                  >
                    新增種類
                  </Button>
                </div>
                {newItem.categories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {newItem.categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleRemoveCategory(cat)}
                        className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
                      >
                        <span>{cat}</span>
                        <span className="text-slate-400">✕</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Input
                label="估計製作時間（分鐘／份）"
                type="number"
                min={0}
                value={newItem.prepMinutes}
                onChange={(e) =>
                  setNewItem({
                    ...newItem,
                    prepMinutes: Number(e.target.value) || 0,
                  })
                }
                required
              />
              <Button
                type="submit"
                className="hidden md:w-auto"
                disabled={saving}
              >
                {saving ? "儲存中..." : "加入今日菜單"}
              </Button>
              {menuError && (
                <p className="hidden text-xs text-red-600 md:block">
                  {menuError}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                每售出一份會消耗的原料
              </p>
              {ingredients.length === 0 && (
                <p className="text-xs text-slate-500">
                  尚未建立原料，請先至「庫存管理」新增原料與庫存。
                </p>
              )}
              <div className="space-y-2">
                {newItem.recipe.map((line, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] items-end gap-2"
                  >
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        原料
                      </label>
                      {ingredients.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          尚未建立原料
                        </p>
                      ) : (
                        <select
                          className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          value={line.ingredientId}
                          onChange={(e) =>
                            handleRecipeChange(
                              index,
                              "ingredientId",
                              e.target.value
                            )
                          }
                        >
                          {ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        每份用量
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        value={line.quantity}
                        onChange={(e) =>
                          handleRecipeChange(
                            index,
                            "quantity",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRecipeLine(index)}
                      className="mb-1 shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                    >
                      刪除
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRecipeLine}
                disabled={ingredients.length === 0}
                className="shrink-0 whitespace-nowrap border-brand-500/20 text-brand-700 hover:bg-brand-50"
              >
                新增原料行
              </Button>

              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  客製化項目（加價、最大數量與額外原料）
                </p>
                <p className="text-xs text-slate-500">
                  例如：「加醬 +10 元，最多 2 份」。這些選項之後可在 POS /
                  Kiosk 點餐時讓顧客選取並影響金額。
                </p>
                <div className="space-y-2">
                  {newItem.customizations.map((c, index) => (
                    <div key={index} className="space-y-2 rounded-lg border border-slate-100 p-3">
                      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            客製化項目
                          </label>
                          <input
                            type="text"
                            className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            value={c.label}
                            onChange={(e) =>
                              handleCustomizationChange(
                                index,
                                "label",
                                e.target.value
                              )
                            }
                            placeholder="例如：加醬、加料"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            加價（元）
                          </label>
                          <input
                            type="number"
                            className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            value={c.priceDelta}
                            onChange={(e) =>
                              handleCustomizationChange(
                                index,
                                "priceDelta",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            最大數量
                          </label>
                          <input
                            type="number"
                            min={1}
                            className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                            value={c.maxQuantity}
                            onChange={(e) =>
                              handleCustomizationChange(
                                index,
                                "maxQuantity",
                                e.target.value
                              )
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCustomizationLine(index)}
                          className="mb-1 shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                        >
                          刪除
                        </button>
                      </div>

                      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                        <p className="text-[11px] font-medium text-slate-600">
                          每單位此客製額外消耗原料
                        </p>
                        {(c.recipe ?? []).length === 0 && (
                          <p className="text-[11px] text-slate-500">
                            若此客製不影響原料用量，可留白。
                          </p>
                        )}
                        <div className="space-y-1">
                          {(c.recipe ?? []).map((line, ri) => (
                            <div
                              key={ri}
                              className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] items-end gap-2"
                            >
                              <div>
                                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                                  原料
                                </label>
                                {ingredients.length === 0 ? (
                                  <p className="text-[11px] text-slate-500">
                                    尚未建立原料
                                  </p>
                                ) : (
                                  <select
                                    className="block w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                    value={line.ingredientId}
                                    onChange={(e) =>
                                      handleCustomizationRecipeChange(
                                        index,
                                        ri,
                                        "ingredientId",
                                        e.target.value
                                      )
                                    }
                                  >
                                    {ingredients.map((ing) => (
                                      <option key={ing.id} value={ing.id}>
                                        {ing.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                                  每單位用量
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  className="block w-full rounded-md border border-slate-200 px-2 py-1 text-[11px] shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                  value={line.quantity}
                                  onChange={(e) =>
                                    handleCustomizationRecipeChange(
                                      index,
                                      ri,
                                      "quantity",
                                      e.target.value
                                    )
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  removeCustomizationRecipeLine(index, ri)
                                }
                                className="mb-1 shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100"
                              >
                                刪除
                              </button>
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addCustomizationRecipeLine(index)}
                          disabled={ingredients.length === 0}
                          className="shrink-0 whitespace-nowrap border-brand-500/20 text-brand-700 hover:bg-brand-50"
                        >
                          新增額外原料行
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomizationLine}
                  className="shrink-0 whitespace-nowrap border-brand-500/20 text-brand-700 hover:bg-brand-50"
                >
                  新增客製化項目
                </Button>

                {/* 手機版：把「加入今日菜單」放到客製化項目下面 */}
                <div className="mt-2 md:hidden">
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? "儲存中..." : "加入今日菜單"}
                  </Button>
                  {menuError && (
                    <p className="mt-2 text-xs text-red-600">{menuError}</p>
                  )}
                </div>
              </div>
            </div>
          </form>
        </Card>
      )}

      <Card title="今日菜單預覽">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            這裡顯示目前已儲存的菜單品項。
          </p>
          {isManagerOrStaff && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingMode((v) => !v)}
            >
              {editingMode ? "完成編輯" : "編輯菜單"}
            </Button>
          )}
        </div>
        {menuLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <MenuPreviewCardSkeleton key={i} />
            ))}
          </div>
        ) : menuError ? (
          <p className="text-sm text-red-600">{menuError}</p>
        ) : menuItems.length === 0 ? (
          <p className="text-sm text-slate-500">
            尚未建立任何今日可販售商品。
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {menuItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                {/* 固定高度圖片區：有/無圖片都維持同高度 */}
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="h-32 w-full bg-slate-100" />
                )}
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">
                        <span className="block truncate">{item.name}</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        今日限量 {item.dailyLimit} 份 · 約 {item.prepMinutes}{" "}
                        分鐘／份
                      </p>
                      <div className="mt-1 min-h-5">
                        {item.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.categories.map((cat) => (
                              <span
                                key={cat}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right space-y-2 shrink-0">
                      <span className="block text-sm font-medium text-brand-700">
                        ${item.price}
                      </span>
                      <div className="min-h-[38px]">
                        {isManagerOrStaff && editingMode && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteMenuItem(item.id)}
                            disabled={saving}
                          >
                            刪除
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600">
                      每份消耗原料：
                    </p>
                    <ul className="space-y-0.5 text-xs text-slate-600">
                      {item.recipe.map((line, idx) => {
                        const ing = ingredients.find(
                          (i) => i.id === line.ingredientId
                        );
                        if (!ing) return null;
                        return (
                          <li key={idx}>
                            {ing.name} × {line.quantity} {ing.unit}
                          </li>
                        );
                      })}
                    </ul>
                    <div className="pt-2 min-h-[40px]">
                      {item.customizations.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-slate-600">
                            可選客製化項目：
                          </p>
                          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                            {item.customizations.map((c) => (
                              <li key={c.id ?? c.label}>
                                {c.label}（+{c.priceDelta} 元，最多{" "}
                                {c.maxQuantity}）
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="原料庫存與需求估算">
        <p className="mb-3 text-sm text-slate-600">
          根據今日菜單與每份用量，估算各原料最低需求量，協助您決定需要準備多少庫存。
        </p>
        {inventoryLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <InventoryDemandCardSkeleton key={i} />
            ))}
          </div>
        ) : inventoryError ? (
          <p className="text-sm text-red-600">{inventoryError}</p>
        ) : ingredients.length === 0 ? (
          <p className="text-sm text-slate-500">
            尚未建立任何原料，請先至「庫存管理」新增原料與庫存。
          </p>
        ) : (
          <div className="space-y-2">
            {ingredients.map((ing) => {
              const current = inventory[ing.id] ?? 0;
              const required = requiredInventory.get(ing.id) || 0;
              const enough = current >= required;

              return (
                <div
                  key={ing.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {ing.name}
                    </p>
                    <p className="text-xs text-slate-500">單位：{ing.unit}</p>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-end">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span>目前庫存：</span>
                      <span className="font-medium">{current}</span>
                      <span className="text-slate-500">{ing.unit}</span>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-slate-600">
                        依菜單預估需求：{" "}
                        <span className="font-medium">
                          {required} {ing.unit}
                        </span>
                      </p>
                      <p
                        className={
                          enough
                            ? "text-[11px] text-green-700"
                            : "text-[11px] text-red-700"
                        }
                      >
                        {enough
                          ? "目前庫存足夠覆蓋今日菜單"
                          : "目前庫存不足，請斟酌調整菜單或補貨"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

