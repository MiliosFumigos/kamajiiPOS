import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50">
      <div className="container mx-auto px-6 py-16">
        {/* Header */}
        <header className="flex items-center justify-between py-6">
          <div className="text-2xl font-bold text-brand-700">Kamajii POS</div>
          <nav className="flex gap-4">
            <Link href="/login">
              <Button variant="outline">登入</Button>
            </Link>
            <Link href="/register">
              <Button>立即註冊</Button>
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="py-20 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            智能餐飲管理
            <span className="block text-brand-600">一站到位</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            多租戶 SaaS POS 系統，支援多品牌、多分店管理。簡化點餐、庫存與報表，讓您的餐飲事業更上一層樓。
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="px-8 py-3">
                免費開始
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="px-8 py-3">
                已有帳號？登入
              </Button>
            </Link>
          </div>
        </section>

        {/* Features placeholder */}
        <section className="grid gap-8 py-20 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">多品牌管理</h3>
            <p className="mt-2 text-slate-600">子網域隔離，每品牌獨立後台</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">角色權限</h3>
            <p className="mt-2 text-slate-600">OWNER / MANAGER / STAFF 分級管理</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">POS 前台</h3>
            <p className="mt-2 text-slate-600">菜單、購物車、訂單流程完整</p>
          </div>
        </section>
      </div>
    </main>
  );
}
