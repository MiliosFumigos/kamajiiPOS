interface CartItemProps {
  id: string;
  name: string;
  price: number;
  quantity: number;
  onQuantityChange?: (id: string, delta: number) => void;
}

export function CartItem({
  id,
  name,
  price,
  quantity,
  onQuantityChange,
}: CartItemProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3">
      <div>
        <p className="font-medium text-slate-900">{name}</p>
        <p className="text-sm text-slate-600">${price} x {quantity}</p>
      </div>
      <div className="flex items-center gap-2">
        {onQuantityChange && (
          <>
            <button
              onClick={() => onQuantityChange(id, -1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              −
            </button>
            <span className="w-8 text-center font-medium">{quantity}</span>
            <button
              onClick={() => onQuantityChange(id, 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              +
            </button>
          </>
        )}
        {!onQuantityChange && <span className="font-medium">{quantity}</span>}
        <span className="ml-4 font-semibold text-brand-600">
          ${price * quantity}
        </span>
      </div>
    </div>
  );
}
