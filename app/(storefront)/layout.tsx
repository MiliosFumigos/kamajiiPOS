import { getBrandFromSubdomain } from "@/lib/brand-context";

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = await getBrandFromSubdomain();

  if (!brand) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">404</h1>
          <p className="mt-2 text-slate-600">找不到該品牌</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-brand-700">{brand.name}</h1>
        <p className="text-sm text-slate-500">線上點餐</p>
      </header>
      {children}
    </div>
  );
}
