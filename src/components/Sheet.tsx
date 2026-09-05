"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 하단에서 올라오는 시트. 종목 선택 / 세트 편집 / 캘린더 날짜 상세가 공유한다.
 * 라이브러리 없이 fixed 로 구현 — 루트 컨테이너가 max-w-md 이므로 위치 계산이 단순하다.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  /** 시트 본문이 길어질 수 있는 경우(종목 목록) 화면 대부분을 차지하게 한다 */
  tall = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  tall?: boolean;
}) {
  // 시트가 열려 있는 동안 뒤 배경이 스크롤되지 않게 한다
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-t border-border bg-surface ${
          tall ? "h-[85dvh]" : "max-h-[85dvh]"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="-mr-2 p-2 text-muted"
          >
            <X size={20} />
          </button>
        </div>
        <div className="safe-b min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
