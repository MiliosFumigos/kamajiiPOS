
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type CustomizationOption = {
  id: string;
  label: string;
  priceDelta: number;
  maxQuantity: number;
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  dailyLimit: number;
  prepMinutes: number;
  imageUrl?: string;
  categories: string[];
  customizations: CustomizationOption[];
};

type CartItem = {
  menuItemId: string;
  quantity: number;
  customizations: Record<string, number>; // customizationId -> qty (per item)
};

function formatTime(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function PlaceholderImage({ name }: { name: string }) {
  const initial = (name?.trim()?.[0] ?? "品").toUpperCase();
  return (
    <div className="flex h-36 w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70 text-lg font-semibold text-slate-600">
        {initial}
      </div>
    </div>
  );
}

export function OrderComposer({
  title,
  menuEndpoint,
  orderEndpoint = "/api/orders",
}: {
  title: string;
  menuEndpoint: string;
  orderEndpoint?: string;
}) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 已「加入訂單」的內容（右側訂單區 & 送出時使用）
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  // 左側每個商品目前調整中的「草稿選擇」（按下加入後才寫入 cart）
  const [draft, setDraft] = useState<Record<string, CartItem>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitDetails, setSubmitDetails] = useState<
    | null
    | {
        ingredientId: string;
        name: string;
        unit: string;
        needed: number;
      }[]
  >(null);
  const [success, setSuccess] = useState<{
    displayId: string;
    placedAt: string;
    total: number;
    status: string;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(menuEndpoint);
        if (!res.ok) throw new Error("載入菜單失敗");
        const data = (await res.json()) as { items: MenuItem[] };
        setMenuItems(data.items ?? []);
      } catch (e) {
        console.error(e);
        setError("無法載入菜單，請稍後再試。");
        setMenuItems([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [menuEndpoint]);

  const cartItems = useMemo(
    () =>
      Object.entries(cart).map(([key, item]) => ({
        ...item,
        _key: key,
      })),
    [cart]
  );

  const totals = useMemo(() => {
    const menuMap = new Map(menuItems.map((m) => [m.id, m]));
    let total = 0;
    const lines = cartItems
      .map((c) => {
        const m = menuMap.get(c.menuItemId);
        if (!m) return null;

        const chosen = Object.entries(c.customizations)
          .map(([id, q]) => {
            const opt = m.customizations.find((x) => x.id === id);
            const qty = Math.max(0, q || 0);
            if (!opt || qty <= 0) return null;
            return { label: opt.label, priceDelta: opt.priceDelta, quantity: qty };
          })
          .filter(Boolean) as { label: string; priceDelta: number; quantity: number }[];

        const perItemDelta = chosen.reduce(
          (acc, cur) => acc + cur.priceDelta * cur.quantity,
          0
        );
        const lineTotal = (m.price + perItemDelta) * c.quantity;
        total += lineTotal;
        const customText =
          chosen.length > 0
            ? chosen.map((cc) => `${cc.label}x${cc.quantity}`).join("、")
            : "";
        return {
          id: c._key,
          name: m.name,
          qty: c.quantity,
          perItemDelta,
          unitPrice: m.price,
          lineTotal,
          customText,
        };
      })
      .filter(Boolean) as {
      id: string;
      name: string;
      qty: number;
      perItemDelta: number;
      unitPrice: number;
      lineTotal: number;
      customText: string;
    }[];

    return { total, lines };
  }, [cartItems, menuItems]);

  const setQty = (menuItemId: string, quantity: number) => {
    setDraft((prev) => {
      const next = { ...prev };
      const q = Math.max(0, Math.floor(quantity));
      if (q <= 0) {
        delete next[menuItemId];
        return next;
      }
      const existing = next[menuItemId] ?? {
        menuItemId,
        quantity: 0,
        customizations: {},
      };
      next[menuItemId] = { ...existing, quantity: q };
      return next;
    });
  };

  const setCustomizationQty = (
    menuItemId: string,
    customizationId: string,
    quantity: number,
    max: number
  ) => {
    setDraft((prev) => {
      const next = { ...prev };
      const item = next[menuItemId];
      if (!item) return prev;
      const q = Math.max(0, Math.min(max, Math.floor(quantity)));
      const customizations = { ...item.customizations };
      if (q <= 0) delete customizations[customizationId];
      else customizations[customizationId] = q;
      next[menuItemId] = { ...item, customizations };
      return next;
    });
  };

  const applyToCart = (menuItemId: string) => {
    const draftItem = draft[menuItemId];
    if (!draftItem || draftItem.quantity <= 0) return;

    const keyParts = Object.entries(draftItem.customizations)
      .filter(([, q]) => (q || 0) > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, q]) => `${id}:${q}`)
      .join("|");
    const cartKey = keyParts ? `${menuItemId}__${keyParts}` : `${menuItemId}__no_cust`;

    setCart((prev) => {
      const existing = prev[cartKey];
      const mergedQty = existing ? existing.quantity + draftItem.quantity : draftItem.quantity;
      return {
        ...prev,
        [cartKey]: {
          menuItemId,
          quantity: mergedQty,
          customizations: { ...draftItem.customizations },
        },
      };
    });
  };

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[cartKey];
      return next;
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitDetails(null);
    setSuccess(null);
    try {
      const payload = {
        items: cartItems.map((c) => ({
          menuItemId: c.menuItemId,
          quantity: c.quantity,
          customizations: Object.entries(c.customizations).map(([customizationId, q]) => ({
            customizationId,
            quantity: q,
          })),
        })),
      };

      const res = await fetch(orderEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        setSubmitError(data?.error || "送出失敗");
        if (Array.isArray(data?.details)) setSubmitDetails(data.details);
        return;
      }

      const order = data?.order;
      if (!order?.displayId) {
        setSubmitError("建立訂單成功，但回傳格式不正確");
        return;
      }

      setSuccess({
        displayId: order.displayId,
        placedAt: order.placedAt,
        total: order.total,
        status: order.status,
      });
      setCart({});
    } catch (e) {
      console.error(e);
      setSubmitError("送出失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">
            選擇商品、調整數量與客製化後送出即可建立訂單並更新庫存。
          </p>
        </div>
        <div className="text-sm text-slate-600">
          購物車：<span className="font-medium">{cartItems.length}</span> 項 ·{" "}
          總計{" "}
          <span className="font-semibold text-brand-700">${totals.total}</span>
        </div>
      </div>

      {/* 預留「訂單已建立」區塊空間；無資料時顯示說明，避免成功後彈出造成 CLS */}
      <div aria-live="polite">
        <Card>
          <div className="min-h-[72px] flex flex-col justify-center gap-2 md:flex-row md:items-center md:justify-between">
            {!success ? (
              <p className="text-sm text-slate-500">
                送出訂單後，此處會顯示最新一筆訂單編號、時間、金額與狀態。
              </p>
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium text-slate-900">訂單已建立</p>
                  <p className="mt-1 text-xs text-slate-600">
                    訂單編號：
                    <span className="font-semibold"> {success.displayId}</span> ·
                    時間：{formatTime(new Date(success.placedAt))}
                  </p>
                </div>
                <div className="text-right md:shrink-0">
                  <p className="text-sm text-slate-700">
                    金額 <span className="font-semibold">${success.total}</span>
                  </p>
                  <p className="text-xs text-slate-500">狀態：{success.status}</p>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="菜單">
          {loading ? (
            <p className="text-sm text-slate-500">載入中...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : menuItems.length === 0 ? (
            <p className="text-sm text-slate-500">目前沒有可點的品項。</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {menuItems.map((item) => {
                const currentQty = draft[item.id]?.quantity ?? 0;
                return (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-36 w-full object-cover"
                      />
                    ) : (
                      <PlaceholderImage name={item.name} />
                    )}
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            約 {item.prepMinutes} 分鐘／份 · 今日上限 {item.dailyLimit}{" "}
                            份
                          </p>
                          {item.categories?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
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
                        <div className="text-right">
                          <p className="text-sm font-semibold text-brand-700">
                            ${item.price}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setQty(item.id, currentQty - 1)}
                            disabled={currentQty <= 0}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {currentQty}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setQty(item.id, currentQty + 1)}
                          >
                            +
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => applyToCart(item.id)}
                          disabled={currentQty <= 0}
                        >
                          加入
                        </Button>
                      </div>
                      {item.customizations.length > 0 && currentQty > 0 && (
                        <div className="pt-2">
                          <p className="text-xs font-medium text-slate-600">
                            客製化（每份加價）
                          </p>
                          <div className="mt-2 space-y-2">
                            {item.customizations
                              .filter((c) => c.maxQuantity >= 1)
                              .map((c) => {
                              const q = draft[item.id]?.customizations?.[c.id] ?? 0;
                              const isSingle = c.maxQuantity === 1;

                              return (
                                <div
                                  key={c.id}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium text-slate-800">
                                      {c.label}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      +{c.priceDelta} 元
                                      {c.maxQuantity > 1 && ` · 最多 ${c.maxQuantity}`}
                                    </p>
                                  </div>
                                  {isSingle ? (
                                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                        checked={q > 0}
                                        onChange={(e) =>
                                          setCustomizationQty(
                                            item.id,
                                            c.id,
                                            e.target.checked ? 1 : 0,
                                            1
                                          )
                                        }
                                      />
                                      <span>加選</span>
                                    </label>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button
                                        className="h-7 w-7 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-100"
                                        onClick={() =>
                                          setCustomizationQty(
                                            item.id,
                                            c.id,
                                            q - 1,
                                            c.maxQuantity
                                          )
                                        }
                                        disabled={q <= 0}
                                        type="button"
                                      >
                                        -
                                      </button>
                                      <span className="w-6 text-center text-xs font-medium">
                                        {q}
                                      </span>
                                      <button
                                        className="h-7 w-7 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-100"
                                        onClick={() =>
                                          setCustomizationQty(
                                            item.id,
                                            c.id,
                                            q + 1,
                                            c.maxQuantity
                                          )
                                        }
                                        disabled={q >= c.maxQuantity}
                                        type="button"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>


        <Card title="訂單">
          {cartItems.length === 0 ? (
            <p className="text-sm text-slate-500">尚未選擇商品。</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {totals.lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {line.name}
                      </p>
                      <p className="text-xs text-slate-600">
                        {line.perItemDelta > 0
                          ? `(${line.unitPrice} + ${line.perItemDelta}) × ${line.qty}`
                          : `${line.unitPrice} × ${line.qty}`}
                      </p>
                      {line.customText && (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          客製：{line.customText}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">${line.lineTotal}</p>
                      <button
                        className="mt-1 text-xs text-slate-500 hover:text-slate-700"
                        type="button"
                        onClick={() => removeFromCart(line.id)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">總計</span>
                  <span className="font-semibold text-brand-700">
                    ${totals.total}
                  </span>
                </div>
              </div>

              {submitError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <p className="font-medium">{submitError}</p>
                  {submitDetails && submitDetails.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                      {submitDetails.map((d) => (
                        <li key={d.ingredientId}>
                          {d.name}：需要 {d.needed} {d.unit}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <Button
                className="w-full"
                onClick={submit}
                disabled={submitting || cartItems.length === 0}
              >
                {submitting ? "送出中..." : "送出訂單（扣庫存）"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

