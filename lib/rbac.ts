import { Role } from "@/lib/types";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  brandId: string | null;
};

/**
 * Get session from JWT token (for API routes)
 */
// 從 request 取出登入者資訊
export async function getSessionFromToken(
  req: NextRequest
): Promise<SessionUser | null> {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token || !token.sub) return null;

  return {
    id: token.sub,
    email: token.email as string,

    name: token.name as string | null,
    role: token.role as Role,
    brandId: token.brandId as string | null,
  };
}

/**
 * Require specific roles - returns 403 if user doesn't have required role
 */
// 檢查這個人夠不夠資格叫這個 API
export function requireRole(
  allowedRoles: Role[]
): (session: SessionUser | null) => NextResponse | null {
  return (session: SessionUser | null): NextResponse | null => {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // 沒登入

    if (!allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { error: "Forbidden: insufficient permissions" },
        { status: 403 }
      );
    }
    // 登入但不允許

    return null;
  };
}

// 從 request JWT 拿 SessionUser，用 Role 做 401/403。