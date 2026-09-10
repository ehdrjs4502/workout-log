"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { endOfMonth, startOfMonth, subDays } from "date-fns";
import { Check, Copy, Share2 } from "lucide-react";
import { Button, PageHeader } from "@/components/ui";
import { listSessionsBetween, loadSessions } from "@/lib/db/repo";
import { sessionsToText, type ExportMode } from "@/lib/export/toText";
import { copyText } from "@/lib/export/clipboard";
import { toDateKey, todayKey } from "@/lib/format/date";

type RangeKey = "today" | "d7" | "month" | "d30" | "custom";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "d7", label: "7일" },
  { key: "month", label: "이번 달" },
  { key: "d30", label: "30일" },
  { key: "custom", label: "직접" },
];

type CustomRange = { from: string; to: string };

function rangeToKeys(range: RangeKey, custom: CustomRange): [string, string] {
  const now = new Date();
  switch (range) {
    case "today":
      return [toDateKey(now), toDateKey(now)];
    case "d7":
      return [toDateKey(subDays(now, 6)), toDateKey(now)];
    case "month":
      return [toDateKey(startOfMonth(now)), toDateKey(endOfMonth(now))];
    case "d30":
      return [toDateKey(subDays(now, 29)), toDateKey(now)];
    case "custom":
      // 거꾸로 고르면 조용히 뒤집는다. 빈 결과만 보여주면 원인을 짐작하기 어렵다.
      return custom.from <= custom.to
        ? [custom.from, custom.to]
        : [custom.to, custom.from];
  }
}

export default function ExportPage() {
  const [range, setRange] = useState<RangeKey>("today");
  const [custom, setCustom] = useState<CustomRange>(() => ({
    from: todayKey(),
    to: todayKey(),
  }));
  const [mode, setMode] = useState<ExportMode>("simple");
  const [copied, setCopied] = useState(false);

  const [from, to] = rangeToKeys(range, custom);

  const sessions = useLiveQuery(async () => {
    const rows = await listSessionsBetween(from, to);
    return loadSessions(rows.map((r) => r.id));
  }, [from, to]);

  // 클립보드 호출이 제스처 안에서 즉시 일어나도록 텍스트는 미리 만들어둔다
  const text = useMemo(
    () => (sessions ? sessionsToText(sessions, mode) : ""),
    [sessions, mode],
  );

  const onCopy = async () => {
    const ok = await copyText(text);
    if (!ok) {
      alert("복사에 실패했습니다. 아래 미리보기에서 직접 선택해 복사해 주세요.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <>
      <PageHeader
        title="내보내기"
        subtitle="AI에게 보여줄 텍스트로 정리"
        back="/settings"
      />

      <main className="flex-1 space-y-4 p-4">
        <div>
          <span className="mb-1.5 block text-xs text-muted">기간</span>
          <div className="grid grid-cols-5 gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`h-10 rounded-xl border text-xs transition ${
                  range === r.key
                    ? "border-transparent bg-text font-semibold text-bg"
                    : "border-border bg-surface text-muted"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {range === "custom" ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <DateField
                label="시작"
                value={custom.from}
                onChange={(from) => setCustom((c) => ({ ...c, from }))}
              />
              <DateField
                label="끝"
                value={custom.to}
                onChange={(to) => setCustom((c) => ({ ...c, to }))}
              />
            </div>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-xs text-muted">형식</span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setMode("simple")}
              className={`h-10 rounded-xl border text-sm transition ${
                mode === "simple"
                  ? "border-transparent bg-text font-semibold text-bg"
                  : "border-border bg-surface text-muted"
              }`}
            >
              간단
            </button>
            <button
              type="button"
              onClick={() => setMode("detailed")}
              className={`h-10 rounded-xl border text-sm transition ${
                mode === "detailed"
                  ? "border-transparent bg-text font-semibold text-bg"
                  : "border-border bg-surface text-muted"
              }`}
            >
              상세 (휴식·RPE 포함)
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            disabled={!text}
            onClick={onCopy}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? "복사됨" : "복사"}
          </Button>
          {canShare ? (
            <Button
              size="lg"
              disabled={!text}
              aria-label="공유"
              onClick={() => navigator.share({ text }).catch(() => {})}
            >
              <Share2 size={18} />
            </Button>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-xs text-muted">미리보기</span>
          <pre className="max-h-[50dvh] overflow-auto rounded-2xl border border-border bg-surface p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
            {sessions === undefined
              ? "불러오는 중…"
              : text || "이 기간에 기록된 세트가 없습니다."}
          </pre>
        </div>
      </main>
    </>
  );
}

/**
 * 네이티브 date input 을 쓴다. 폰에서는 OS 피커가 뜨고,
 * globals.css 의 color-scheme: dark 덕에 달력도 알아서 어둡게 나온다.
 */
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block px-1 text-xs text-muted">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          // 사용자가 입력칸을 비우면 빈 문자열이 온다 — 그때는 값을 유지한다
          if (e.target.value) onChange(e.target.value);
        }}
        className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm tabular-nums outline-none focus:border-accent [&::-webkit-calendar-picker-indicator]:opacity-60"
      />
    </label>
  );
}
