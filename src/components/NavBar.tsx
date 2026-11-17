"use client";

import Link from "next/link";

export default function NavBar() {
  return (
    <nav className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
      <div className="max-w-5xl mx-auto flex justify-between items-center">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Rehearse
          <span className="ml-2 text-sm font-normal text-slate-400">追问</span>
        </Link>

        <div className="flex gap-5 items-center text-sm">
          <Link href="/" className="hover:text-blue-600">
            首页
          </Link>
          <Link href="/parse" className="hover:text-blue-600">
            简历解析
          </Link>
          <Link href="/session/demo" className="hover:text-blue-600">
            开始练习
          </Link>
        </div>
      </div>
    </nav>
  );
}
