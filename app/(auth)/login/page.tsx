"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

/** 依品牌 subdomain 組出 app dashboard 網址（登入後跳轉用） */
function getDashboardUrlForBrand(brandSubdomain: string): string {
  if (typeof window === "undefined") return "/app/dashboard";
  const { protocol, hostname, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${brandSubdomain}.localhost:${port || "3000"}/app/dashboard`;
  }
  if (hostname === "lvh.me") {
    return `${protocol}//${brandSubdomain}.lvh.me${port ? `:${port}` : ""}/app/dashboard`;
  }
  const parts = hostname.split(".");
  const baseDomain = parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
  return `${protocol}//${brandSubdomain}.${baseDomain}${port ? `:${port}` : ""}/app/dashboard`;
}

function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return null;
  if (host.endsWith(".localhost")) return host.split(".")[0] || null;
  if (host.endsWith(".lvh.me")) return host.split(".")[0] || null;
  const parts = host.split(".");
  return parts.length >= 3 ? parts[0] : null;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/app/dashboard";
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSubdomain(getSubdomain());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        subdomain: subdomain || undefined,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // 若有品牌 subdomain，導向該品牌的 app dashboard（避免根網域受品牌路由限制）
      const session = await getSession();
      if (session?.user?.brandSubdomain) {
        if (typeof window !== "undefined") {
          const host = window.location.hostname;
      
          // 已經在子網域（例如 brandtest001.localhost 或 brandtest001.kamajii.com）
          const isSubdomainLocalhost =
            host.endsWith(".localhost") && host.split(".").length >= 2;
      
          if (isSubdomainLocalhost) {
            // 子網域自己登入：直接走當前 host 的 /app/dashboard，不再重組 host
            router.push("/app/dashboard");
            router.refresh();
            return;
          }
      
          // 其餘情況（主網域登入）：依 brandSubdomain 組出子網域 URL
          window.location.href = getDashboardUrlForBrand(session.user.brandSubdomain);
          return;
        }
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("登入失敗，請稍後再試");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">登入</h1>
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <Input
            label="電子信箱"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <Input
            label="密碼"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登入中..." : "登入"}
          </Button>
          <p className="text-center text-sm text-slate-600">
            還沒有帳號？{" "}
            <Link href="/register" className="font-medium text-brand-600 hover:underline">
              立即註冊
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-500">載入中...</div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
