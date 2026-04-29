"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

/** 從路徑 /<brand>/... 取得品牌代號（path-based 多租戶） */
function getBrandFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const rootRoutes = new Set([
    "login",
    "register",
    "app",
    "kiosk",
    "menu",
    "cart",
  ]);
  if (parts.length === 1 && rootRoutes.has(parts[0])) return null;

  if (parts.length >= 2 && (parts[1] === "login" || parts[1] === "register")) {
    return parts[0];
  }

  return null;
}

type BrandOption = {
  brandId: string;
  brandName: string;
  subdomain: string;
  role: string;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/app/dashboard";
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [brandModalOpen, setBrandModalOpen] = useState(false);

  useEffect(() => {
    setSubdomain(getBrandFromPath());
  }, []);

  const mapLoginError = (message?: string | null) => {
    if (!message) return "登入失敗，請稍後再試";
    if (message === "CredentialsSignin") return "帳號或密碼不正確";
    return message;
  };

  const completeLogin = async (targetSubdomain?: string) => {
    const result = await signIn("credentials", {
      email,
      password,
      subdomain: targetSubdomain || undefined,
      redirect: false,
    });

    if (result?.error) {
      throw new Error(mapLoginError(result.error));
    }

    const session = await getSession();
    if (session?.user?.brandSubdomain) {
      router.push(`/${session.user.brandSubdomain}/app/dashboard`);
      router.refresh();
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  };

  const resolveBrandOptions = async (): Promise<BrandOption[]> => {
    const response = await fetch("/api/auth/brand-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof data?.error === "string" ? data.error : "帳號或密碼不正確"
      );
    }

    return Array.isArray(data?.options) ? data.options : [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const loginTask = async () => {
        if (subdomain) {
          await completeLogin(subdomain);
          return;
        }

        const options = await resolveBrandOptions();
        if (options.length === 1) {
          await completeLogin(options[0].subdomain);
          return;
        }

        if (options.length > 1) {
          setBrandOptions(options);
          setBrandModalOpen(true);
          return;
        }

        throw new Error("找不到可登入的品牌");
      };

      await toast.promise(loginTask(), {
        loading: "登入中...",
        success: "登入成功",
        error: (err) => {
          const msg =
            err instanceof Error
              ? mapLoginError(err.message)
              : "登入失敗，請稍後再試";
          setError(msg);
          return msg;
        },
      });
    } catch {
      // 錯誤訊息由 toast.promise 的 error callback 統一處理
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex justify-center">
            <Link
              href="/"
              aria-label="回到首頁"
              className="rounded-xl p-1 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:drop-shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 motion-reduce:transform-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand-assets/kamajii-logo.png"
                alt="Kamajii Logo"
                className="h-16 w-auto object-contain"
              />
            </Link>
          </div>
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
            <Link
              href={subdomain ? `/${subdomain}/register` : "/register"}
              className="font-medium text-brand-600 hover:underline"
            >
              立即註冊
            </Link>
          </p>
        </form>
      </Card>

      {brandModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-md">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                選擇登入品牌
              </h2>
              <p className="text-sm text-slate-600">
                這組帳號在多個品牌都有權限，請選擇這次要進入的品牌。
              </p>
              <div className="space-y-2">
                {brandOptions.map((option) => (
                  <button
                    key={option.brandId}
                    type="button"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                    onClick={async () => {
                      setError("");
                      setLoading(true);
                      try {
                        await toast.promise(completeLogin(option.subdomain), {
                          loading: "登入中...",
                          success: `已登入 ${option.brandName}`,
                          error: (err) => {
                            const msg =
                              err instanceof Error
                                ? mapLoginError(err.message)
                                : "登入失敗，請稍後再試";
                            setError(msg);
                            return msg;
                          },
                        });
                        setBrandModalOpen(false);
                      } catch {
                        // 錯誤訊息由 toast.promise callback 處理
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    <p className="font-medium text-slate-900">
                      {option.brandName}
                    </p>
                    <p className="text-xs text-slate-500">
                      /{option.subdomain}
                    </p>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setBrandModalOpen(false)}
                  disabled={loading}
                >
                  取消
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-slate-500">載入中...</div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
