"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { BODY_PART_COLOR, type BodyPart } from "@/lib/db/schema";
import { formatDateKo, formatDurationMs } from "@/lib/format/date";
import type { HydratedSession } from "@/lib/db/repo";
import { sessionVolume } from "@/lib/stats/volume";

export function summarizeSession(session: HydratedSession) {
  const names = session.items
    .map((i) => i.exercise?.name)
    .filter((n): n is string => !!n);

  const parts = [
    ...new Set(
      session.items
        .map((i) => i.exercise?.bodyPart)
        .filter((p): p is BodyPart => !!p),
    ),
  ];

  return {
    names,
    parts,
    setCount: session.items.reduce((n, i) => n + i.sets.length, 0),
    durationMs: session.endedAt ? session.endedAt - session.startedAt : 0,
    volume: sessionVolume(session),
  };
}

export function SessionSummaryCard({ session }: { session: HydratedSession }) {
  const { names, parts, setCount, durationMs, volume } = summarizeSession(session);

  const nameLine =
    names.length === 0
      ? "기록된 종목 없음"
      : names.length <= 3
        ? names.join(" · ")
        : `${names.slice(0, 3).join(" · ")} 외 ${names.length - 3}개`;

  return (
    <Link
      href={`/session/${session.id}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 active:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{formatDateKo(session.date)}</span>
          <span className="flex gap-1">
            {parts.map((p) => (
              <span
                key={p}
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: BODY_PART_COLOR[p] }}
              />
            ))}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">{nameLine}</p>
        <p className="mt-1 text-xs tabular-nums text-muted">
          {setCount}세트
          {durationMs > 0 ? ` · ${formatDurationMs(durationMs)}` : ""}
          {volume > 0 ? ` · ${Math.round(volume).toLocaleString()}kg` : ""}
        </p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );
}
