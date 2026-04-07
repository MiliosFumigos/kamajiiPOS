"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";

export interface DashboardShellProps {
  topbarTitle: string;
  children: React.ReactNode;
  brandName: string;
  brandSubdomain: string;
  userRole: string;
  userName?: string | null;
  storeName?: string | null;
}

export function DashboardShell({
  topbarTitle,
  children,
  brandName,
  brandSubdomain,
  userRole,
  userName,
  storeName,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar
        brandName={brandName}
        brandSubdomain={brandSubdomain}
        userRole={userRole}
        userName={userName}
        storeName={storeName}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        desktopCollapsed={desktopCollapsed}
        onToggleDesktopCollapse={() => setDesktopCollapsed((v) => !v)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar title={topbarTitle} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto bg-slate-50 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
