"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LoadingBlock, PageHeader } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import {
  SessionSummaryCard,
  summarizeSession,
} from "@/components/SessionSummaryCard";
import { listSessionsBetween, loadSessions, type HydratedSession } from "@/lib/db/repo";
import { BODY_PART_COLOR } from "@/lib/db/schema";
import { formatDateKo, toDateKey, todayKey } from "@/lib/format/date";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function CalendarPage() {
  // Date 를 그대로 state 로 두면 useLiveQuery 의 deps 가 매번 달라진다 → 문자열 키로 고정
  const [monthKey, setMonthKey] = useState(() => format(new Date(), "yyyy-MM"));
  const [selected, setSelected] = useState<string | null>(null);

  const month = parseISO(`${monthKey}-01`);

  const sessions = useLiveQuery(async () => {
    const rows = await listSessionsBetween(
      toDateKey(startOfMonth(month)),
      toDateKey(endOfMonth(month)),
    );
    return loadSessions(rows.map((r) => r.id));
  }, [monthKey]);

  const byDate = useMemo(() => {
    const map = new Map<string, HydratedSession[]>();
    for (const s of sessions ?? []) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sessions]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });

  const monthStats = useMemo(() => {
    const list = sessions ?? [];
    return {
      count: list.length,
      volume: list.reduce((sum, s) => sum + summarizeSession(s).volume, 0),
    };
  }, [sessions]);

  const shift = (delta: number) =>
    setMonthKey(format(addMonths(month, delta), "yyyy-MM"));

  const today = todayKey();
  const selectedSessions = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <>
      <PageHeader title="캘린더" />

      <div className="flex items-center gap-1 px-4 py-3">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => shift(-1)}
          className="p-2 text-muted active:text-text"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="min-w-24 text-center font-semibold tabular-nums">
          {format(month, "yyyy년 M월")}
        </h2>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => shift(1)}
          className="p-2 text-muted active:text-text"
        >
          <ChevronRight size={20} />
        </button>
        <button
          type="button"
          onClick={() => setMonthKey(format(new Date(), "yyyy-MM"))}
          className="ml-auto rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted active:bg-surface"
        >
          오늘
        </button>
      </div>

      <div className="px-4">
        <div className="grid grid-cols-7 pb-1">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs ${
                i === 0 ? "text-danger/70" : i === 6 ? "text-accent/70" : "text-muted"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const key = toDateKey(day);
            const list = byDate.get(key) ?? [];
            const parts = [
              ...new Set(list.flatMap((s) => summarizeSession(s).parts)),
            ].slice(0, 4);
            const outside = !isSameMonth(day, month);

            return (
              <button
                key={key}
                type="button"
                disabled={list.length === 0}
                onClick={() => setSelected(key)}
                className={`flex h-13 flex-col items-center justify-center gap-1 rounded-xl transition ${
                  list.length > 0 ? "bg-surface active:bg-surface-2" : ""
                } ${outside ? "opacity-30" : ""}`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-[13px] tabular-nums ${
                    key === today
                      ? "bg-accent font-bold text-accent-fg"
                      : list.length > 0
                        ? "font-medium"
                        : "text-muted"
                  }`}
                >
                  {format(day, "d")}
                </span>
                <span className="flex h-1.5 gap-0.5">
                  {parts.map((p) => (
                    <span
                      key={p}
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ background: BODY_PART_COLOR[p] }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4">
        {sessions === undefined ? (
          <LoadingBlock />
        ) : (
          <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted tabular-nums">
            이번 달 <span className="text-text">{monthStats.count}회</span>
            {monthStats.volume > 0 ? (
              <>
                {" · 총 볼륨 "}
                <span className="text-text">
                  {Math.round(monthStats.volume).toLocaleString()}kg
                </span>
              </>
            ) : null}
          </p>
        )}
      </div>

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? formatDateKo(selected) : ""}
      >
        <div className="space-y-2 p-4">
          {selectedSessions.map((session) => (
            <SessionSummaryCard key={session.id} session={session} />
          ))}
        </div>
      </Sheet>
    </>
  );
}
