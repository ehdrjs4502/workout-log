"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import {
  BODY_PARTS,
  BODY_PART_COLOR,
  BODY_PART_LABEL,
  type BodyPart,
  type Exercise,
} from "@/lib/db/schema";

/**
 * 검색 + 부위 필터 + 목록.
 * /exercises(관리)와 로깅 화면의 종목 선택 시트가 함께 쓴다.
 */
export function ExerciseBrowser({
  exercises,
  onPick,
  renderTrailing,
  footer,
  emptyMessage = "종목이 없습니다.",
}: {
  exercises: Exercise[];
  onPick?: (exercise: Exercise) => void;
  renderTrailing?: (exercise: Exercise) => ReactNode;
  footer?: ReactNode;
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const [part, setPart] = useState<BodyPart | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        (part === "all" || e.bodyPart === part) &&
        (q === "" || e.name.toLowerCase().includes(q)),
    );
  }, [exercises, query, part]);

  const grouped = useMemo(() => {
    const map = new Map<BodyPart, Exercise[]>();
    for (const e of filtered) {
      const list = map.get(e.bodyPart) ?? [];
      list.push(e);
      map.set(e.bodyPart, list);
    }
    return BODY_PARTS.map((p) => ({ ...p, items: map.get(p.key) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [filtered]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="종목 검색"
            className="h-11 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-base outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
          <Chip active={part === "all"} onClick={() => setPart("all")}>
            전체
          </Chip>
          {BODY_PARTS.map((p) => (
            <Chip
              key={p.key}
              active={part === p.key}
              color={p.color}
              onClick={() => setPart(p.key)}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {emptyMessage}
          </p>
        ) : (
          grouped.map((group) => (
            <section key={group.key}>
              <h3 className="sticky top-0 z-10 bg-surface/95 px-4 py-1.5 text-xs font-medium text-muted backdrop-blur">
                {group.label}
              </h3>
              <ul>
                {group.items.map((exercise) => (
                  <li
                    key={exercise.id}
                    className="flex items-center border-b border-border/60"
                  >
                    <button
                      type="button"
                      disabled={!onPick}
                      onClick={() => onPick?.(exercise)}
                      className="flex min-h-13 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left disabled:cursor-default"
                    >
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: BODY_PART_COLOR[exercise.bodyPart] }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">
                          {exercise.name}
                        </span>
                        <span className="block text-xs text-muted">
                          {BODY_PART_LABEL[exercise.bodyPart]} · 기본 휴식{" "}
                          {exercise.defaultRestSec}초
                        </span>
                      </span>
                    </button>
                    {renderTrailing ? (
                      <div className="flex shrink-0 items-center pr-2">
                        {renderTrailing(exercise)}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {footer}
      </div>
    </div>
  );
}

function Chip({
  active,
  color,
  children,
  onClick,
}: {
  active: boolean;
  color?: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 shrink-0 rounded-full border px-3 text-sm transition ${
        active
          ? "border-transparent bg-text text-bg font-medium"
          : "border-border bg-surface-2 text-muted"
      }`}
      style={active && color ? { background: color, color: "#0b0d10" } : undefined}
    >
      {children}
    </button>
  );
}
