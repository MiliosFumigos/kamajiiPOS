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

      if (!res.ok) {
        setError(data.error || "註冊失敗");
        setLoading(false);
        return;
      }

      // 自動登入
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("註冊成功，請前往登入頁面");
        setLoading(false);
        router.push("/login?registered=1");
        return;
      }

      // 導向該品牌的 app dashboard（需使用子網域）
      const subdomain = data.brand?.subdomain;
      if (subdomain) {
        const { protocol, hostname, port } = window.location;
        const isLocalhostRoot = hostname === "localhost" || hostname === "127.0.0.1";
        const isLocalhostSub = hostname.endsWith(".localhost");
        const isLvhRoot = hostname === "lvh.me";
        const isLvhSub = hostname.endsWith(".lvh.me");

        const baseUrl =
          isLocalhostRoot || isLocalhostSub
            ? `${protocol}//${subdomain}.localhost:${port || "3000"}`
            : isLvhRoot || isLvhSub
              ? `${protocol}//${subdomain}.lvh.me${port ? `:${port}` : ""}`
              : `${protocol}//${subdomain}.${hostname.split(".").slice(-2).join(".")}${port ? `:${port}` : ""}`;
        window.location.href = `${baseUrl}/app/dashboard`;
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
          <h1 className="text-2xl font-bold text-slate-900">註冊為品牌持有人</h1>
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
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              登入
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
}
