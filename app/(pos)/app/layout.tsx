import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBrandFromSubdomain } from "@/lib/brand-context";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, brand] = await Promise.all([
    getServerSession(authOptions),
    getBrandFromSubdomain(),
  ]);

  if (!session) {
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
    <div className="flex h-screen">
      <Sidebar
        brandName={brand.name}
        userRole={session.user.role}
        userName={session.user.name ?? null}
        storeName={storeName}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="管理後台" />
        <main className="flex-1 overflow-auto bg-slate-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

