"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Dumbbell,
  FileText,
  ListChecks,
  Settings,
} from "lucide-react";

const TABS = [
  { href: "/", label: "오늘", icon: Dumbbell },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/export", label: "내보내기", icon: FileText },
  { href: "/exercises", label: "종목", icon: ListChecks },
  { href: "/settings", label: "설정", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  // 로깅 화면은 하단을 휴식 타이머 바가 차지한다
  if (pathname.startsWith("/session/")) return null;

  return (
    <>
      {/* 고정 네비게이션에 콘텐츠가 가리지 않도록 흐름 안에 스페이서를 둔다 */}
      <div aria-hidden className="h-[calc(3.75rem+env(safe-area-inset-bottom))]" />
      <nav className="safe-b fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-surface/95 backdrop-blur">
        <ul className="flex">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-15 flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                    active ? "text-accent" : "text-muted"
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
