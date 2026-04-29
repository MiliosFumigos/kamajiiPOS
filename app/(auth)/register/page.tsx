"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      const brandSubdomain: string | null = data.brand?.subdomain ?? null;

      if (!res.ok) {
        setError(data.error || "註冊失敗");
        setLoading(false);
        return;
      }

      // 自動登入
      const result = await signIn("credentials", {
        email,
        password,
        subdomain: brandSubdomain || undefined,
        redirect: false,
      });

      if (result?.error) {
        setError("註冊成功，請前往登入頁面");
        setLoading(false);
        router.push("/login?registered=1");
        return;
      }

      // 導向該品牌的 app dashboard（path-based 多租戶）
      if (brandSubdomain) {
        router.push(`/${brandSubdomain}/app/dashboard`);
        router.refresh();
      } else {
        router.push("/app/dashboard");
      }
    } catch {
      setError("註冊失敗，請稍後再試");
    }
    setLoading(false);
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
          <h1 className="text-2xl font-bold text-slate-900">
            註冊為品牌持有人
          </h1>
          <p className="text-sm text-slate-600">
            註冊後將自動建立您的品牌，並獲得專屬子網域
          </p>
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <Input
            label="品牌名稱 / 您的姓名"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="我的餐廳"
            required
          />
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
            placeholder="至少 8 個字元"
            minLength={8}
            required
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "註冊中..." : "註冊"}
          </Button>
          <p className="text-center text-sm text-slate-600">
            已有帳號？{" "}
            <Link
              href="/login"
              className="font-medium text-brand-600 hover:underline"
            >
              登入
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
}
