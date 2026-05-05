import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://kamajii-pos.vercel.app"),
  title: "Kamajii POS - 智能餐飲管理系統",
  description: "多租戶 SaaS POS 系統，助力您的餐飲事業",
  openGraph: {
    type: "website",
    url: "https://kamajii-pos.vercel.app",
    title: "Kamajii POS - 智能餐飲管理系統",
    description: "多租戶 SaaS POS 系統，助力您的餐飲事業",
    siteName: "Kamajii POS",
    images: [
      {
        url: "/brand-assets/kamajii-logo.png",
        alt: "Kamajii Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kamajii POS - 智能餐飲管理系統",
    description: "多租戶 SaaS POS 系統，助力您的餐飲事業",
    images: ["/brand-assets/kamajii-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
