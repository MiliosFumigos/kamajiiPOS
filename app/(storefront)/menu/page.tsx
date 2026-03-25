"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProductCard } from "@/components/storefront/ProductCard";
import { Button } from "@/components/ui/Button";

const DEMO_MENU = [
  { id: "1", name: "牛肉麵", price: 150, description: "秘製湯頭，軟嫩牛腱" },
  { id: "2", name: "滷肉飯", price: 50, description: "經典台式滷肉" },
  { id: "3", name: "蛋花湯", price: 30, description: "清爽蛋花湯" },
  { id: "4", name: "小菜拼盤", price: 80, description: "精選三樣小菜" },
  { id: "5", name: "紅茶", price: 25, description: "古早味紅茶" },
  { id: "6", name: "套餐優惠", price: 200, description: "主餐 + 湯 + 飲料" },
];

export default function MenuPage() {
  const [cart, setCart] = useState<Record<string, number>>({});
  const pathname = usePathname();
  const brand = pathname.split("/").filter(Boolean)[0] ?? "";

  const addToCart = (id: string) => {
    setCart((prev) => ({
      ...prev,
      [id]: (prev[id] || 0) + 1,
    }));
  };

  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <main className="container mx-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">菜單</h2>
        <Link href={brand ? `/${brand}/cart` : "/cart"}>
          <Button>
            購物車 {totalItems > 0 && `(${totalItems})`}
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_MENU.map((item) => (
          <ProductCard
            key={item.id}
            id={item.id}
            name={item.name}
            price={item.price}
            description={item.description}
            onAddToCart={addToCart}
          />
        ))}
      </div>
    </main>
  );
}
