import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";

type BrandOption = {
  brandId: string;
  brandName: string;
  subdomain: string;
  role: Role;
};

export async function POST(request: Request) {
  let body: { email?: string; password?: string } | null = null;
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "請提供 JSON body" }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "請輸入電子信箱和密碼" },
      { status: 400 }
    );
  }

  const users = await prisma.user.findMany({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      role: { in: [Role.OWNER, Role.MANAGER, Role.STAFF] },
      brandId: { not: null },
    },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          subdomain: true,
        },
      },
    },
  });

  if (users.length === 0) {
    return NextResponse.json({ error: "帳號或密碼不正確" }, { status: 401 });
  }

  const options: BrandOption[] = [];
  for (const user of users) {
    if (!user.password || !user.brand) continue;
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) continue;
    options.push({
      brandId: user.brand.id,
      brandName: user.brand.name,
      subdomain: user.brand.subdomain,
      role: user.role as Role,
    });
  }

  if (options.length === 0) {
    return NextResponse.json({ error: "帳號或密碼不正確" }, { status: 401 });
  }

  const deduped = new Map<string, BrandOption>();
  for (const option of options) {
    if (!deduped.has(option.brandId)) {
      deduped.set(option.brandId, option);
    }
  }

  const brandOptions = Array.from(deduped.values()).sort((a, b) =>
    a.brandName.localeCompare(b.brandName, "zh-Hant")
  );

  return NextResponse.json({
    options: brandOptions,
  });
}
