"use client";

import { X } from "lucide-react";
import { formatClock } from "@/lib/format/date";
import { useRestTimer } from "@/lib/timer/useRestTimer";

export function RestTimerBar() {
  const { timer, elapsedSec, remainingSec, isDone, addSeconds, skip } =
    useRestTimer();

  if (!timer) return null;

  const progress = Math.min(1, elapsedSec / Math.max(1, timer.targetSec));

  return (
    <div className="safe-b fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-surface/95 backdrop-blur">
      <div
        aria-hidden
        className={`h-0.5 origin-left transition-transform duration-200 ${
          isDone ? "bg-success" : "bg-accent"
        }`}
        style={{ transform: `scaleX(${progress})` }}
      />
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted">
            {isDone ? "휴식 끝 — 다음 세트" : "휴식 중"}
          </p>
          <p
            className={`font-mono text-2xl font-semibold tabular-nums ${
              isDone ? "text-success" : "text-text"
            }`}
          >
            {isDone ? `+${formatClock(-remainingSec)}` : formatClock(remainingSec)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => addSeconds(-30)}
          className="h-10 rounded-lg border border-border px-2.5 text-xs tabular-nums text-muted active:bg-border"
        >
          −30초
        </button>
        <button
          type="button"
          onClick={() => addSeconds(30)}
          className="h-10 rounded-lg border border-border px-2.5 text-xs tabular-nums text-muted active:bg-border"
        >
          +30초
        </button>
        <button
          type="button"
          aria-label="휴식 종료"
          onClick={() => skip()}
          className="flex size-10 items-center justify-center rounded-lg border border-border text-muted active:bg-border"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
