import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/types";
import { apiError } from "@/lib/api-error";
import { getBrandFaviconUrl, getBrandLogoUrl } from "@/lib/brand-assets";

type BrandAssetsPayload = {
  logoUrl: string | null;
  faviconUrl: string | null;
  resolvedLogoUrl: string;
  resolvedFaviconUrl: string;
};

type BrandAssetsUpdateBody = {
  logoUrl?: string | null;
  faviconUrl?: string | null;
};

function toNullableTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildBrandAssetsPayload(data: {
  logoUrl: string | null;
  faviconUrl: string | null;
}): BrandAssetsPayload {
  return {
    logoUrl: data.logoUrl,
    faviconUrl: data.faviconUrl,
    resolvedLogoUrl: getBrandLogoUrl(data.logoUrl),
    resolvedFaviconUrl: getBrandFaviconUrl(data.faviconUrl),
  };
}

async function requireOwnerBrandSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false as const, response: apiError("UNAUTHORIZED", "Unauthorized", 401) };
  }
  if (session.user.role !== Role.OWNER) {
    return { ok: false as const, response: apiError("FORBIDDEN", "Only owner can access", 403) };
  }
  if (!session.user.brandId) {
    return { ok: false as const, response: apiError("BRAND_NOT_FOUND", "Brand not found", 400) };
  }
  return { ok: true as const, brandId: session.user.brandId };
}

export async function GET() {
  try {
    const auth = await requireOwnerBrandSession();
    if (!auth.ok) return auth.response;

    const brand = await prisma.brand.findUnique({
      where: { id: auth.brandId },
      select: { logoUrl: true, faviconUrl: true },
    });
    if (!brand) return apiError("BRAND_NOT_FOUND", "Brand not found", 404);

    return NextResponse.json(buildBrandAssetsPayload(brand));
  } catch (error) {
    console.error("GET /api/brand/assets failed:", error);
    return apiError("INTERNAL_ERROR", "Failed to load brand assets", 500);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireOwnerBrandSession();
    if (!auth.ok) return auth.response;

    let body: BrandAssetsUpdateBody = {};
    try {
      body = (await request.json()) as BrandAssetsUpdateBody;
    } catch {
      return apiError("INVALID_JSON", "Invalid JSON body", 400);
    }

    if (
      (body.logoUrl !== undefined &&
        body.logoUrl !== null &&
        typeof body.logoUrl !== "string") ||
      (body.faviconUrl !== undefined &&
        body.faviconUrl !== null &&
        typeof body.faviconUrl !== "string")
    ) {
      return apiError("INVALID_BODY", "logoUrl and faviconUrl must be string or null", 400);
    }

    const updated = await prisma.brand.update({
      where: { id: auth.brandId },
      data: {
        logoUrl: toNullableTrimmedString(body.logoUrl),
        faviconUrl: toNullableTrimmedString(body.faviconUrl),
      },
      select: {
        logoUrl: true,
        faviconUrl: true,
      },
    });

    return NextResponse.json(buildBrandAssetsPayload(updated));
  } catch (error) {
    console.error("PUT /api/brand/assets failed:", error);
    return apiError("INTERNAL_ERROR", "Failed to save brand assets", 500);
  }
}
