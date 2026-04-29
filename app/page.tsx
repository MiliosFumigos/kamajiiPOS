import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

export default function LandingPage() {
  const quickSteps = [
    {
      icon: "🏷️",
      title: "建立品牌與營運帳號",
      description:
        "先註冊品牌，建立店長帳號；店長再建立店員帳號與密碼，完成分工後再開始每日營運設定。",
    },
    {
      icon: "🧾",
      title: "建立庫存與菜單後開始點餐",
      description:
        "先建立原料庫存、商品與客製選項；完成後，店員可在 POS 代客點餐，顧客也可在自助點餐頁依同一份菜單下單，系統會自動計算金額。",
    },
    {
      icon: "👨‍🍳",
      title: "廚房即時接單",
      description:
        "新訂單會同步到 POS 與廚房看板（KDS），現場人員依序製作並更新狀態，前後場資訊保持一致。",
    },
    {
      icon: "💳",
      title: "完成取餐與結帳",
      description:
        "可支援現金或刷卡，顧客可即時查看訂單進度；系統也會同步累積銷售與營運數據，方便店長每日檢視與優化。",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-brand-50/40">
      <div className="container mx-auto px-6 py-10 sm:py-12">
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

        {/* Hero + default logo */}
        <section className="grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
          <div className="order-2 md:order-1">
            <p className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
              餐飲現場也能快速上手
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              智能餐飲管理
              <span className="block text-brand-600">一站到位</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              Kamajii POS
              把點餐、出單、庫存與營運報表放在同一套系統。介面用簡單步驟引導，
              就算第一次接觸數位工具，也能跟著流程完成每日營業。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register">
                <Button
                  size="lg"
                  className="group px-8 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none"
                >
                  立即開始使用 ✨
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  variant="outline"
                  size="lg"
                  className="group px-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/60 motion-reduce:transform-none"
                >
                  我已有帳號 →
                </Button>
              </Link>
            </div>
          </div>

          <div className="order-1 flex justify-center md:order-2 md:justify-end">
            <div className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-[0_20px_60px_-35px_rgba(2,6,23,0.45)] backdrop-blur">
              <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium tracking-wide text-slate-500">
                Kamajii POS
              </div>
              <div className="mt-5 flex items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 via-white to-brand-50/40 p-8">
                <Image
                  src="/brand-assets/kamajii-logo.png"
                  alt="Kamajii Logo"
                  width={220}
                  height={220}
                  className="h-24 w-auto object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,0.16)]"
                  priority
                />
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-500">
                Kamajii 源自《神隱少女》中鍋爐爺爺的日文名「かまじい」。
                用戶將會像是擁有六隻手臂、總能在忙碌中穩穩完成任務的鍋爐爺爺，
                Kamajii 也為了讓餐飲現場從容而可靠地完成每一個挑戰而存在。
              </p>
            </div>
          </div>
        </section>

        {/* Product highlights */}
        <section className="py-10 sm:py-14">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">
              這套系統能幫你解決什麼
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-base font-semibold text-slate-900">
                  ⚡ 接單更順
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  前台點餐、後台接單、廚房製作同步進行。
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-base font-semibold text-slate-900">
                  😎 錯誤更少
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  庫存與每日限量自動檢查，降低漏單與超賣。
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-base font-semibold text-slate-900">
                  👯‍♀️ 分工更清楚
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  店長、店員、顧客各有對應畫面與權限。
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-base font-semibold text-slate-900">
                  📊 經營看得到
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  營收、熱門品項、尖峰時段一目了然。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works for everyone */}
        <section className="py-10 sm:py-16">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              往下看，四步就懂怎麼用
            </h2>
            <p className="mx-auto mt-3 max-w-3xl text-slate-600">
              不需要技術背景，只要照著步驟操作，就能完成一天營業流程。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {quickSteps.map((step, index) => (
              <article
                key={step.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none"
              >
                <p className="text-sm font-semibold text-brand-600">
                  STEP {index + 1}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">
                  <span className="mr-2" aria-hidden>
                    {step.icon}
                  </span>
                  {step.title}
                </h3>
                <p className="mt-3 leading-7 text-slate-600">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-10 flex justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="px-8 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none"
              >
                先建立店家帳號 🚀
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="outline"
                size="lg"
                className="px-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/60 motion-reduce:transform-none"
              >
                直接登入開始營業 →
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
