import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export function Card({ title, children, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
      {...props}
    >
      {title && (
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h3>
        </div>
      )}
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}
