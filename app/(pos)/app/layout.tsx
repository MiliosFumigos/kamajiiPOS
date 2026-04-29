import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBrandFromSubdomain } from "@/lib/brand-context";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getBrandFaviconUrl, getBrandLogoUrl } from "@/lib/brand-assets";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const brandFromHeader = await getBrandFromSubdomain();

  // If middleware/header didn't provide `x-brand-subdomain` (e.g. user lands on `/app/*`
  // without a `/<brand>/` prefix), fall back to session.user.brandId to keep the app working.
  // For POS dashboard pages, `session.user.brandId` should be the source of truth.
  // This avoids any mismatch between URL brand and header parsing.
  const brandSelect = {
    id: true,
    name: true,
    subdomain: true,
    logoUrl: true,
    faviconUrl: true,
  } as const;

  const brand =
    session?.user?.brandId
      ? await prisma.brand.findUnique({
          where: { id: session.user.brandId },
          select: brandSelect,
        })
      : brandFromHeader
        ? await prisma.brand.findUnique({
            where: { id: brandFromHeader.id },
            select: brandSelect,
          })
        : null;

  if (!session) {
    if (brand) {
      redirect(
        `/${brand.subdomain}/login?callbackUrl=/${brand.subdomain}/app/dashboard`
      );
    }
    redirect("/login?callbackUrl=/app/dashboard");
  }

  if (!brand) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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

  const userBrandId = session.user.brandId;
  if (userBrandId && userBrandId !== brand.id) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">無權限</h1>
          <p className="mt-2 text-slate-600">您不屬於此品牌</p>
        </div>
      </div>
    );
  }

  let storeName: string | null = null;
  if (session.user.storeId) {
    const store = await prisma.store.findUnique({
      where: { id: session.user.storeId },
      select: { name: true },
    });
    storeName = store?.name ?? null;
  }

  return (
    <DashboardShell
      topbarTitle="管理後台"
      brandName={brand.name}
      brandLogoUrl={getBrandLogoUrl(brand.logoUrl)}
      brandFaviconUrl={getBrandFaviconUrl(brand.faviconUrl)}
      brandSubdomain={brand.subdomain}
      userRole={session.user.role}
      userName={session.user.name ?? null}
      storeName={storeName}
    >
      {children}
    </DashboardShell>
  );
}

