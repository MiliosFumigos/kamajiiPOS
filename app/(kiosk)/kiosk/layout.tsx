import { getBrandFromSubdomain } from "@/lib/brand-context";
import { getBrandFaviconUrl, getBrandLogoUrl } from "@/lib/brand-assets";
import type { Metadata } from "next";
import { KioskHeaderOrdersButton } from "@/components/kiosk/KioskHeaderOrdersButton";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandFromSubdomain();
  if (!brand) return {};

  return {
    icons: {
      icon: getBrandFaviconUrl(brand.faviconUrl),
      shortcut: getBrandFaviconUrl(brand.faviconUrl),
      apple: getBrandFaviconUrl(brand.faviconUrl),
    },
  };
}

export default async function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = await getBrandFromSubdomain();

  if (!brand) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">404</h1>
          <p className="mt-2 text-slate-600">找不到該品牌</p>
          <p className="mt-1 text-sm text-slate-500">
            請確認您使用的是正確的子網域（例如：acme.localhost:3000）
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-[1480px] grid-cols-[1fr_auto_1fr] items-center px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 justify-self-start">
            {/* 手機板字級略小，避免 header 太高 */}
            <p className="text-xs font-medium text-slate-500 sm:text-sm">
              自助點餐
            </p>
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
              {brand.name}
            </h1>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getBrandLogoUrl(brand.logoUrl)}
            alt={`${brand.name} logo`}
            className="h-14 w-auto justify-self-center flex-shrink-0 object-contain sm:max-w-[180px]"
          />

          {/* Header 右側：進入「訂單總覽」 */}
          <div className="justify-self-end">
            <KioskHeaderOrdersButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1480px] p-4">{children}</main>
    </div>
  );
}
