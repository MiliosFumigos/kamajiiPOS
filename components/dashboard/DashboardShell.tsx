"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";

const BRAND_ASSETS_UPDATED_EVENT = "brand-assets-updated";

export interface DashboardShellProps {
  topbarTitle: string;
  children: React.ReactNode;
  brandName: string;
  brandLogoUrl: string;
  brandFaviconUrl: string;
  brandSubdomain: string;
  userRole: string;
  userName?: string | null;
  storeName?: string | null;
}

export function DashboardShell({
  topbarTitle,
  children,
  brandName,
  brandLogoUrl,
  brandFaviconUrl,
  brandSubdomain,
  userRole,
  userName,
  storeName,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(brandLogoUrl);
  const [currentFaviconUrl, setCurrentFaviconUrl] = useState(brandFaviconUrl);

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

  useEffect(() => {
    setCurrentLogoUrl(brandLogoUrl);
  }, [brandLogoUrl]);

  useEffect(() => {
    setCurrentFaviconUrl(brandFaviconUrl);
  }, [brandFaviconUrl]);

  useEffect(() => {
    const onAssetsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{
        resolvedLogoUrl?: string;
        resolvedFaviconUrl?: string;
      }>;
      const nextLogo = customEvent.detail?.resolvedLogoUrl?.trim();
      const nextFavicon = customEvent.detail?.resolvedFaviconUrl?.trim();
      if (nextLogo) setCurrentLogoUrl(nextLogo);
      if (nextFavicon) setCurrentFaviconUrl(nextFavicon);
    };

    window.addEventListener(BRAND_ASSETS_UPDATED_EVENT, onAssetsUpdated as EventListener);
    return () => {
      window.removeEventListener(
        BRAND_ASSETS_UPDATED_EVENT,
        onAssetsUpdated as EventListener
      );
    };
  }, []);

  useEffect(() => {
    const head = document.head;
    const relSelectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
    ];

    for (const selector of relSelectors) {
      const links = Array.from(head.querySelectorAll<HTMLLinkElement>(selector));
      if (links.length === 0) {
        const link = document.createElement("link");
        link.rel = selector.includes("apple-touch-icon")
          ? "apple-touch-icon"
          : selector.includes("shortcut")
            ? "shortcut icon"
            : "icon";
        link.href = currentFaviconUrl;
        head.appendChild(link);
      } else {
        for (const link of links) {
          link.href = currentFaviconUrl;
        }
      }
    }
  }, [currentFaviconUrl]);

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
        <Topbar
          title={topbarTitle}
          brandName={brandName}
          brandLogoUrl={currentLogoUrl}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-auto bg-slate-50 p-4 md:p-6 [scrollbar-gutter:stable]">
          {children}
        </main>
      </div>
    </div>
  );
}
