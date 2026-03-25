"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CartItem } from "@/components/storefront/CartItem";
import { Button } from "@/components/ui/Button";

const DEMO_ITEMS = [
  { id: "1", name: "牛肉麵", price: 150 },
  { id: "2", name: "滷肉飯", price: 50 },
  { id: "3", name: "蛋花湯", price: 30 },
];

export default function CartPage() {
  const [items, setItems] = useState(
    Object.fromEntries(DEMO_ITEMS.map((i) => [i.id, 2]))
  );
  const pathname = usePathname();
  const brand = pathname.split("/").filter(Boolean)[0] ?? "";

  const handleQuantityChange = (id: string, delta: number) => {
    setItems((prev) => {
      const next = (prev[id] || 0) + delta;
      if (next <= 0) {
        const nextItems = { ...prev };
        delete nextItems[id];
        return nextItems;
      }
      return { ...prev, [id]: next };
    });
  };

  const total = DEMO_ITEMS.reduce(
    (sum, item) => sum + item.price * (items[item.id] || 0),
    0
  );

  return (
    <main className="container mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">購物車</h2>
        <Link href={brand ? `/${brand}/menu` : "/menu"}>
          <Button variant="outline">繼續點餐</Button>
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {Object.keys(items).length === 0 ? (
          <p className="py-8 text-center text-slate-500">購物車是空的</p>
        ) : (
          <>
            {DEMO_ITEMS.filter((i) => items[i.id]).map((item) => (
              <CartItem
                key={item.id}
                id={item.id}
                name={item.name}
                price={item.price}
                quantity={items[item.id]}
                onQuantityChange={handleQuantityChange}
              />
            ))}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="flex justify-between text-lg font-bold">
                <span>總計</span>
                <span className="text-brand-600">${total}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {Object.keys(items).length > 0 && (
        <div className="mt-6">
          <Button className="w-full" size="lg">
            結帳
          </Button>
        </div>
      )}
    </main>
  );
}
