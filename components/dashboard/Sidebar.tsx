"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { HiChevronDoubleLeft, HiChevronDoubleRight } from "react-icons/hi";
import { toast } from "sonner";

interface SidebarProps {
  brandName: string;
  brandSubdomain: string;
  userRole: string;
  userName?: string | null;
  storeName?: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  desktopCollapsed: boolean;
  onToggleDesktopCollapse: () => void;
}

const roleLabels: Record<string, string> = {
  OWNER: "品牌持有人",
  MANAGER: "分店長",
  STAFF: "店員",
  CUSTOMER: "顧客",
};

export function Sidebar({
  brandName,
  brandSubdomain,
  userRole,
  userName,
  storeName,
  mobileOpen,
  onCloseMobile,
  desktopCollapsed,
  onToggleDesktopCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const links =
    userRole === "OWNER"
      ? [
          { href: `/${brandSubdomain}/app/dashboard`, label: "總覽" },
          { href: `/${brandSubdomain}/app/staff`, label: "員工" },
        ]
      : [
          { href: `/${brandSubdomain}/app/dashboard`, label: "總覽" },
          { href: `/${brandSubdomain}/app/order`, label: "點餐" },
          { href: `/${brandSubdomain}/app/menu`, label: "菜單管理" },
          { href: `/${brandSubdomain}/app/inventory`, label: "庫存管理" },
          { href: `/${brandSubdomain}/app/orders`, label: "訂單" },
          { href: `/${brandSubdomain}/app/kds`, label: "KDS（廚房）" },
          ...(userRole === "MANAGER"
            ? [{ href: `/${brandSubdomain}/app/staff`, label: "員工" }]
            : []),
        ];

  const handleNav = () => {
    onCloseMobile();
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      const signOutTask = signOut({ callbackUrl: "/", redirect: false });
      await toast.promise(signOutTask, {
        loading: "登出中...",
        success: "已登出",
        error: "登出失敗，請稍後再試",
      });
      const result = await signOutTask;
      router.push(result?.url || "/");
      router.refresh();
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-50 flex h-full flex-shrink-0 flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-200 ease-out print:hidden",
        "w-56",
        desktopCollapsed ? "md:w-16" : "md:w-56",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        "md:static md:translate-x-0",
      ].join(" ")}
    >
      <div
        className={`border-b border-slate-100 ${desktopCollapsed ? "p-4 md:p-2 md:text-center" : "p-4"}`}
      >
        <h2
          className={`font-bold text-brand-700 ${desktopCollapsed ? "md:text-lg" : "text-base"}`}
          title={brandName}
        >
          {desktopCollapsed ? (
            <>
              <span className="md:hidden">{brandName}</span>
              <span className="hidden md:inline">{brandName.slice(0, 1)}</span>
            </>
          ) : (
            brandName
          )}
        </h2>
        <div
          className={`mt-1 space-y-0.5 text-xs text-slate-500 ${desktopCollapsed ? "md:hidden" : ""}`}
        >
          <p>
            {(roleLabels[userRole] || userRole) +
              (userName ? ` · ${userName}` : "")}
          </p>
          {storeName && <p>分店：{storeName}</p>}
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            title={link.label}
            onClick={handleNav}
            className={`block rounded-lg text-sm font-medium transition-colors ${
              desktopCollapsed
                ? "px-4 py-2 text-center md:px-1 md:py-2"
                : "px-4 py-2"
            } ${
              pathname === link.href
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {desktopCollapsed ? (
              <>
                <span className="md:hidden">{link.label}</span>
                <span className="hidden md:inline">
                  {link.label.slice(0, 1)}
                </span>
              </>
            ) : (
              link.label
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-2">
        <button
          type="button"
          onClick={onToggleDesktopCollapse}
          className="mb-1 hidden w-full items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-500 group hover:bg-slate-50 md:flex"
          title={desktopCollapsed ? "展開側欄" : "收合側欄"}
        >
          <span aria-hidden className="inline-flex text-base leading-none">
            {desktopCollapsed ? (
              <HiChevronDoubleRight className="h-4 w-4" />
            ) : (
              <HiChevronDoubleLeft className="h-4 w-4 fill-wabi-green-500 group-hover:fill-brand-500" />
            )}
          </span>
          <span className="sr-only">
            {desktopCollapsed ? "展開側欄" : "收合側欄"}
          </span>
        </button>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className={`w-full rounded-lg text-sm text-slate-600 group hover:bg-slate-50  ${
            desktopCollapsed
              ? "px-4 py-2 text-left md:px-1 md:text-center "
              : "px-4 py-2 text-center"
          } ${isSigningOut ? "cursor-not-allowed opacity-70" : ""}`}
          title="登出"
        >
          {desktopCollapsed ? (
            <>
              <span className="md:hidden">登出</span>
              <span className="hidden md:inline">登</span>
            </>
          ) : (
            "登出"
          )}
        </button>
      </div>
    </aside>
  );
}
