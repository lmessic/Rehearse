import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Toast from "@/components/Toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rehearse · 追问 — 用你的简历，练你的面试",
  description:
    "从简历里挖出面试官一定会追问的项目点，逐题陪你练，最后给一份能直接改进的复盘报告。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body
        className={`${inter.className} bg-slate-50 dark:bg-slate-900 min-h-screen text-slate-800 dark:text-slate-100`}
      >
        <NavBar />
        <main className="max-w-5xl mx-auto p-4 md:p-6">{children}</main>
        <Toast />
      </body>
    </html>
  );
}
