"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { DEFAULT_BRAND_FAVICON_URL } from "@/lib/brand-assets";

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

    const applyFaviconUrl = (url: string) => {
      for (const selector of relSelectors) {
        const links = Array.from(head.querySelectorAll<HTMLLinkElement>(selector));
        if (links.length === 0) {
          const link = document.createElement("link");
          link.rel = selector.includes("apple-touch-icon")
            ? "apple-touch-icon"
            : selector.includes("shortcut")
              ? "shortcut icon"
              : "icon";
          link.href = url;
          head.appendChild(link);
        } else {
          for (const link of links) {
            link.href = url;
          }
        }
      }
    };

    applyFaviconUrl(currentFaviconUrl);

    // When leaving the POS dashboard (e.g. logout), restore to default favicon
    // so we don't keep a previous brand's custom favicon.
    return () => {
      applyFaviconUrl(DEFAULT_BRAND_FAVICON_URL);
    };
  }, [currentFaviconUrl]);

  return (
    <div className="flex h-screen overflow-hidden print:h-auto print:min-h-0 print:overflow-visible">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 print:hidden md:hidden"
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:min-h-0 print:flex-1 print:overflow-visible">
        <Topbar
          title={topbarTitle}
          brandName={brandName}
          brandLogoUrl={currentLogoUrl}
          logoHref={`/${brandSubdomain}/app/dashboard`}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-auto bg-slate-50 p-4 md:p-6 [scrollbar-gutter:stable] print:overflow-visible print:bg-white print:[scrollbar-gutter:auto]">
          {children}
        </main>
      </div>
    </div>
  );
}
