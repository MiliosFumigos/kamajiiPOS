import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { apiError } from "@/lib/api-error";

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
    return apiError("INVALID_JSON", "請提供 JSON body", 400);
  }

  const email = body.email?.trim();
  const password = body.password ?? "";

  if (!email || !password) {
    return apiError("INVALID_INPUT", "請輸入電子信箱和密碼", 400);
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
    return apiError("INVALID_CREDENTIALS", "帳號或密碼不正確", 401);
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
    return apiError("INVALID_CREDENTIALS", "帳號或密碼不正確", 401);
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
