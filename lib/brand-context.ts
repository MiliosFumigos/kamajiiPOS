import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Get brand from subdomain (set by middleware)
 * Returns null if brand not found (404 case)
 */
export async function getBrandFromSubdomain(): Promise<{
  id: string;
  name: string;
  subdomain: string;
  logoUrl: string | null;
  faviconUrl: string | null;
} | null> {
  const headersList = await headers();
  const subdomain = headersList.get("x-brand-subdomain");
  if (!subdomain) return null;

  const brand = await prisma.brand.findUnique({
    where: { subdomain },
    select: {
      id: true,
      name: true,
      subdomain: true,
      logoUrl: true,
      faviconUrl: true,
    },
  });
  return brand;
}

// 看domain分配品牌的DB
