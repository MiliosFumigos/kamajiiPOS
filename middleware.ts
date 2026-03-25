import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Path-based multi-tenant middleware:
// - User visits: /<brand>/app/dashboard
// - We rewrite internally to: /app/dashboard
// - And we pass brand via header `x-brand-subdomain` (keeps existing brand-context logic).
const HEADER_BRAND = "x-brand-subdomain";

function getBrandAndRouteFromPath(pathname: string):
  | { brand: string; base: string; rest: string[] }
  | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [brand, base, ...rest] = parts;
  return { brand, base, rest };
}

function rewriteTargetForBase(base: string, rest: string[]): string | null {
  switch (base) {
    case "app":
      if (rest.length === 0) return "/app/dashboard";
      return `/app/${rest.join("/")}`;
    case "menu":
      return rest.length === 0 ? "/menu" : `/menu/${rest.join("/")}`;
    case "cart":
      return rest.length === 0 ? "/cart" : `/cart/${rest.join("/")}`;
    case "kiosk":
      return rest.length === 0 ? "/kiosk" : `/kiosk/${rest.join("/")}`;
    case "login":
      return "/login";
    case "register":
      return "/register";
    default:
      return null;
  }
}

export function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;

    const parsed = getBrandAndRouteFromPath(pathname);
    if (!parsed) return NextResponse.next();

    const { brand, base, rest } = parsed;
    const targetPath = rewriteTargetForBase(base, rest);
    if (!targetPath) return NextResponse.next();

    const url = new URL(request.url);
    url.pathname = targetPath;

    // Recreate Headers to make sure the instance is correctly forwarded.
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set(HEADER_BRAND, brand);

    return NextResponse.rewrite(url, {
      request: {
        headers: forwardedHeaders,
      },
    });
  } catch {
    // Never let middleware crash the whole app.
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Run middleware for tenant pages, but NEVER for Next.js/API paths.
    // Important: avoid accidentally matching `/api/menu` as `/:brand/menu`.
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
