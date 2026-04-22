import { getBrandFromSubdomain } from "@/lib/brand-context";

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
        <div className="mx-auto flex max-w-8xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm text-slate-500">自助點餐</p>
            <h1 className="text-lg font-semibold text-slate-900">
              {brand.name}
            </h1>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-8xl p-4">{children}</main>
    </div>
  );
}
