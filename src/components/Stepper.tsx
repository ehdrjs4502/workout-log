"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

/**
 * 숫자 스테퍼. 헬스장에서 한 손으로 쓰는 게 목적이라
 * 직접 입력보다 ± 버튼이 주 조작 수단이고, 버튼은 44px 이상을 확보한다.
 */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  max = 9999,
  suffix,
  /** 0일 때 대신 보여줄 문구 (예: 맨몸) */
  zeroLabel,
  decimal = false,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step: number;
  min?: number;
  max?: number;
  suffix?: string;
  zeroLabel?: string;
  decimal?: boolean;
}) {
  // 타이핑 중에는 문자열 상태를 쓰고, blur 시점에 숫자로 확정한다.
  const [draft, setDraft] = useState<string | null>(null);

  // 바깥에서 값이 바뀌면 타이핑 중이던 draft 를 버린다.
  // effect 대신 렌더 중에 조정하는 React 공식 패턴 — 렌더가 한 번 덜 돈다.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(null);
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const bump = (delta: number) => {
    // 부동소수 오차 방지 (60 + 2.5 → 62.5, 0.1 더하기 누적 방지)
    const next = clamp(Math.round((value + delta) * 100) / 100);
    onChange(next);
  };

  const commit = () => {
    if (draft === null) return;
    const parsed = decimal ? parseFloat(draft) : parseInt(draft, 10);
    onChange(Number.isFinite(parsed) ? clamp(parsed) : value);
    setDraft(null);
  };

  const display =
    draft !== null
      ? draft
      : value === 0 && zeroLabel
        ? zeroLabel
        : String(value);

  return (
    <div className="flex-1">
      <label className="mb-1.5 block text-center text-xs text-muted">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <StepButton onClick={() => bump(-step)} aria-label={`${label} 감소`}>
          <Minus size={18} />
        </StepButton>
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            inputMode={decimal ? "decimal" : "numeric"}
            value={display}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
            onFocus={(e) => {
              setDraft(String(value));
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-12 w-full rounded-xl border border-border bg-surface-2 text-center text-lg font-semibold tabular-nums outline-none focus:border-accent"
          />
          {suffix && display !== zeroLabel ? (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">
              {suffix}
            </span>
          ) : null}
        </div>
        <StepButton onClick={() => bump(step)} aria-label={`${label} 증가`}>
          <Plus size={18} />
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className="flex h-12 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted active:bg-border"
    >
      {children}
    </button>
  );
}
