import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import {
  isPrismaConnectivityError,
  prisma,
  withPrismaRetry,
} from "@/lib/prisma";
import { Role } from "@/lib/types";

function getSharedCookieDomain(): string | undefined {
  // 目標：讓「主網域」與「所有子網域」共用同一份 NextAuth session cookie。
  // - 開發環境：localhost 與 *.localhost → domain 設為 ".localhost"
  // - 正式環境：yourapp.com 與 *.yourapp.com → domain 設為 `.${APP_DOMAIN}`（由部署環境提供）
  const raw = (process.env.APP_DOMAIN ?? "").trim();

  // 容錯：如果有人不小心填成 URL（含 protocol / port），這裡把 hostname 抽出來
  const hostname = (() => {
    if (!raw) return "";
    try {
      if (raw.includes("://")) return new URL(raw).hostname;
    } catch {
      // ignore
    }
    return raw.split(":")[0];
  })();

  if (hostname) return hostname.startsWith(".") ? hostname : `.${hostname}`;

  // 沒提供 APP_DOMAIN 時：開發環境先退回 localhost，避免整個 auth 壞掉
  if (process.env.NODE_ENV === "development") return ".localhost";
  return undefined;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      brandId: string | null;
      storeId: string | null;
      brandSubdomain: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    role: Role;
    brandId: string | null;
    storeId: string | null;
    brandSubdomain?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    brandId: string | null;
    storeId: string | null;
    brandSubdomain: string | null;
  }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  cookies: (() => {
    const domain = getSharedCookieDomain();
    if (!domain) return undefined;

    // NextAuth 在 https 下會使用 __Secure / __Host 前綴的 cookie 名稱。
    // 這裡依 NODE_ENV 做一個合理預設（正式環境通常走 https）。
    const secure = process.env.NODE_ENV === "production";

    return {
      sessionToken: {
        name: secure
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
        options: {
          domain,
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure,
        },
      },
      csrfToken: {
        name: secure ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
        options: {
          domain,
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure,
        },
      },
      callbackUrl: {
        name: secure
          ? "__Secure-next-auth.callback-url"
          : "next-auth.callback-url",
        options: {
          domain,
          path: "/",
          sameSite: "lax",
          secure,
        },
      },
    };
  })(),
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        subdomain: { label: "Subdomain", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("請輸入電子信箱和密碼");
        }

        // 僅在有「有效子網域」時才限定品牌；localhost 登入時 subdomain 可能為 undefined 或字串 "undefined"
        const subdomain =
          credentials.subdomain &&
          String(credentials.subdomain).trim() !== "" &&
          String(credentials.subdomain) !== "undefined"
            ? String(credentials.subdomain)
            : null;

        const baseWhere = {
          email: credentials.email,
          role: { in: [Role.OWNER, Role.MANAGER, Role.STAFF] },
        };

        // Path-based 多租戶下，URL 的 brand 片段可能跟 DB 的 brand.subdomain
        // 不完全一致（例如字串規則/使用者輸入差異）。
        // 這會導致查不到 user 直接 401。為了讓「註冊後登入」穩定，
        // 先用 subdomain 查；找不到時回退只用 email 查。
        const whereWithSubdomain = subdomain
          ? { ...baseWhere, brand: { subdomain } }
          : baseWhere;

        let user = null;
        try {
          user = await withPrismaRetry(() =>
            prisma.user.findFirst({
              where: whereWithSubdomain,
              include: { brand: true },
            }),
          );

          if (!user && subdomain) {
            user = await withPrismaRetry(() =>
              prisma.user.findFirst({
                where: baseWhere,
                include: { brand: true },
              }),
            );
          }
        } catch (error) {
          if (isPrismaConnectivityError(error)) {
            throw new Error("服務喚醒中，請 1-2 秒後再試一次");
          }
          throw error;
        }

        if (!user || !user.password) {
          throw new Error("找不到使用者或密碼錯誤");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("密碼錯誤");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          brandId: user.brandId,
          storeId: user.storeId,
          brandSubdomain: user.brand?.subdomain ?? null,
        };
      },
    }),
  ],

  // authorize = 用 email/密碼/+可選 subdomain 去 Prisma 查 user → bcrypt 驗證密碼 → 回傳 user 資訊
  //接著根據authorize取得的user 物件塞進token，這樣子每次需要解析JWT都能得到id role brandId

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.brandId = user.brandId;
        token.storeId = user.storeId;
        token.brandSubdomain = user.brandSubdomain ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.brandId = token.brandId;
        session.user.storeId = token.storeId;
        session.user.brandSubdomain = token.brandSubdomain ?? null;
      }
      return session;
    },
    //session callback 會把token裡的user資訊複製到session，讓每次(例如檢查權限或是每次request)getSession都能拿到user資訊
  },
};

// NextAuth 設定：登入方式、JWT、session 長相、Prisma+bcrypt 驗證。
