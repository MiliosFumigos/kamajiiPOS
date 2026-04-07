import { headers } from "next/headers";
import Image from "next/image";
import { getServerSession } from "next-auth";
import * as QRCode from "qrcode";

import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { Role } from "@/lib/types";

export default async function AppDashboardPage() {
  const session = await getServerSession(authOptions);
  const currentUser = session?.user;

  if (!currentUser?.brandId) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-slate-900">分店與 Kiosk 設定</h2>
        <Card>
          <p className="px-4 py-3 text-sm text-red-600">無法取得目前登入資訊。</p>
        </Card>
      </div>
    );
  }

  const store =
    (currentUser.storeId
      ? await prisma.store.findUnique({
          where: { id: currentUser.storeId },
          select: { id: true, name: true },
        })
      : null) ??
    (await prisma.store.findFirst({
      where: { brandId: currentUser.brandId },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }));

  if (!store) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-slate-900">分店與 Kiosk 設定</h2>
        <Card>
          <p className="px-4 py-3 text-sm text-red-600">找不到此品牌的分店資料。</p>
        </Card>
      </div>
    );
  }

  const manager = await prisma.user.findFirst({
    where: { storeId: store.id, role: Role.MANAGER },
    select: { name: true, email: true },
  });

  const userName = currentUser.name ?? currentUser.email ?? "—";
  const managerName = manager?.name ?? manager?.email ?? "—";

  const host = headers().get("host") || "localhost:3000";
  const proto = headers().get("x-forwarded-proto") ?? "http";
  const brandSlug = currentUser.brandSubdomain;
  const kioskPath = brandSlug ? `/${brandSlug}/kiosk` : "/kiosk";
  const kioskUrl = `${proto}://${host}${kioskPath}?storeId=${encodeURIComponent(store.id)}`;

  const qrDataUrl = await QRCode.toDataURL(kioskUrl, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
        分店與 Kiosk 設定
      </h2>

      <Card>
        <div className="flex flex-col gap-5 p-3 sm:gap-6 sm:p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4 lg:min-w-0 lg:flex-1">
            <div>
              <p className="text-xs font-medium text-slate-500">分店名稱</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{store.name}</p>
            </div>

            <div className="grid gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-slate-500">分店長</span>
                <span className="min-w-0 break-all font-medium text-slate-800">{managerName}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-slate-500">登入者</span>
                <span className="min-w-0 break-all font-medium text-slate-800">{userName}</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="shrink-0 text-slate-500 sm:w-20">storeId</span>
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800">
                    {store.id}
                  </code>
                  <div className="w-full sm:w-auto">
                    <CopyButton text={store.id} successText="storeId 已複製" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-4 md:flex-row md:items-start lg:w-auto">
            <div className="w-full rounded-xl border border-slate-200 bg-white p-3 md:max-w-xl">
              <p className="text-xs font-medium text-slate-500">分店 Kiosk 網址（可複製 / 掃描）</p>
              <div className="mt-2 flex flex-col gap-2">
                <code className="break-all rounded-lg bg-slate-50 px-2 py-2 text-xs text-slate-800">
                  {kioskUrl}
                </code>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="w-full sm:w-auto">
                    <CopyButton
                      text={kioskUrl}
                      successText="Kiosk URL 已複製"
                    />
                  </div>
                  <span className="text-xs text-slate-500">請使用此網址開啟分店點餐畫面。</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center self-center md:self-start">
              {/* QR code as data URL to avoid extra image route */}
              <Image
                src={qrDataUrl}
                alt="Kiosk QR Code"
                width={176}
                height={176}
                unoptimized
                className="h-36 w-36 sm:h-40 sm:w-40 lg:h-44 lg:w-44"
              />
              <p className="mt-2 text-center text-[11px] text-slate-500">
                掃描後可直接進入此分店 Kiosk
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

