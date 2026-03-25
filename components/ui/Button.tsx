import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "xs" | "sm" | "lg";
}

export function Button({
  variant = "default",
  size = "default",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    default: "bg-brand-600 text-white hover:bg-brand-700",
    outline: "border border-slate-300 bg-white hover:bg-slate-50",
    ghost: "hover:bg-slate-100",
  };
  const sizes = {
    default: "h-10 px-4 py-2",
    xs: "h-7 px-2.5 text-xs",
    sm: "h-8 px-3 text-sm",
    lg: "h-12 px-6 text-lg",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
