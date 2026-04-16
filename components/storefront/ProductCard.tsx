"use client";

import { Button } from "@/components/ui/Button";

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  description?: string;
  image?: string;
  onAddToCart: (id: string) => void;
}

export function ProductCard({
  id,
  name,
  price,
  description,
  image,
  onAddToCart,
}: ProductCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="aspect-[4/3] bg-slate-100">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-slate-300">
            🍜
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-slate-900">{name}</h3>
        {description && (
          <p className="mt-1 text-sm text-slate-600 line-clamp-2">{description}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-brand-600">${price}</span>
          <Button size="sm" onClick={() => onAddToCart(id)}>
            加入購物車
          </Button>
        </div>
      </div>
    </div>
  );
}
