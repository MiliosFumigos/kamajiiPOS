import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require brand subdomain (app backend, storefront)
const BRAND_ROUTES = ["/app", "/menu", "/cart", "/kiosk"];
// Auth routes on root domain
const AUTH_ROUTES = ["/login", "/register"];

/**
 * Edge Runtime: inline helpers to avoid unsupported-module bundling.
 * (Same logic as `lib/subdomain.ts`)
 */
function getSubdomainFromHost(host: string): string | null {
  // Remove port
  const hostname = host.split(":")[0];

  // localhost or 127.0.0.1 - for local dev, first part before .localhost is subdomain
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return null;
  }

  if (hostname.endsWith(".localhost")) {
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return parts[0];
    }
  }

  // Local dev A 方案：*.lvh.me
  if (hostname.endsWith(".lvh.me")) {
    const parts = hostname.split(".");
    if (parts.length >= 3) {
      return parts[0];
    }
  }

  // Production: subdomain.example.com
  const parts = hostname.split(".");
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

function isRootDomain(host: string): boolean {
  return getSubdomainFromHost(host) === null;
}

function isBrandRoute(pathname: string): boolean {
  return BRAND_ROUTES.some((route) => pathname.startsWith(route));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

export function middleware(request: NextRequest) {
  try {
    const host = request.headers.get("host") || "";
    const pathname = request.nextUrl.pathname;

    // For local dev: use acme.localhost:3000 format
    // For production: use acme.yourapp.com
    const subdomain = getSubdomainFromHost(host);
    const onRootDomain = isRootDomain(host);

    // Brand routes (dashboard, storefront) require subdomain
    if (isBrandRoute(pathname)) {
      if (onRootDomain) {
        // Redirect to root with message - or show landing
        return NextResponse.redirect(request.nextUrl.origin + "/");
      }

      if (subdomain) {
        // Pass subdomain to downstream via header (layout will lookup brand)
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-brand-subdomain", subdomain);

        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      }
    }

    // Auth routes - allow both root and subdomain
    if (isAuthRoute(pathname)) {
      if (subdomain) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-brand-subdomain", subdomain);
        return NextResponse.next({
          request: { headers: requestHeaders },
        });
      }
    }

    // NextAuth API routes
    if (pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    return NextResponse.next();
  } catch {
    // Never let middleware crash the whole app.
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|images|.*\\.png$|.*\\.jpg$).*)",
  ],
};
