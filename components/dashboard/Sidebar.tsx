"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface SidebarProps {
  brandName: string;
  userRole: string;
  userName?: string | null;
  storeName?: string | null;
}

const roleLabels: Record<string, string> = {
  OWNER: "品牌持有人",
  MANAGER: "分店長",
  STAFF: "店員",
  CUSTOMER: "顧客",
};

export function Sidebar({ brandName, userRole, userName, storeName }: SidebarProps) {
  const pathname = usePathname();

  const links =
    userRole === "OWNER"
      ? [
          { href: "/app/dashboard", label: "總覽" },
          { href: "/app/staff", label: "員工" },
        ]
      : [
          { href: "/app/dashboard", label: "總覽" },
          { href: "/app/order", label: "點餐" },
          { href: "/app/menu", label: "菜單管理" },
          { href: "/app/inventory", label: "庫存管理" },
          { href: "/app/orders", label: "訂單" },
          { href: "/app/kds", label: "KDS（廚房）" },
          ...(userRole === "MANAGER" ? [{ href: "/app/staff", label: "員工" }] : []),
        ];

  return (
    <aside className="flex h-full w-56 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-bold text-brand-700">{brandName}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {(roleLabels[userRole] || userRole) +
            (userName ? ` · ${userName}` : "")}
        </p>
        {storeName && (
          <p className="mt-0.5 text-xs text-slate-500">分店：{storeName}</p>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`block rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              pathname === link.href
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-2">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full rounded-lg px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
        >
          登出
        </button>
      </div>
    </aside>
  );
}
