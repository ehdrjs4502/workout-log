"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { subMonths } from "date-fns";
import { ChevronDown, TrendingUp } from "lucide-react";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { ExerciseBrowser } from "@/components/ExerciseBrowser";
import { TrendChart } from "@/components/stats/TrendChart";
import { listDatedSets, listExercises, type DatedSet } from "@/lib/db/repo";
import {
  BODY_PARTS,
  BODY_PART_COLOR,
  BODY_PART_LABEL,
  type BodyPart,
  type Exercise,
} from "@/lib/db/schema";
import {
  bodyPartTotals,
  bodyPartTrend,
  busiestExerciseId,
  exerciseDays,
  exerciseTrend,
  totals,
  type Bucket,
} from "@/lib/stats/history";
import { formatSetWeight } from "@/lib/stats/volume";
import { formatDateKo, toDateKey, todayKey } from "@/lib/format/date";

type Mode = "exercise" | "part";
type PeriodKey = "m1" | "m3" | "m6" | "all";

/** 1개월은 하루 단위로, 그보다 길면 주 단위로 묶는다 */
const PERIODS: { key: PeriodKey; label: string; months: number; bucket: Bucket }[] = [
  { key: "m1", label: "1개월", months: 1, bucket: "day" },
  { key: "m3", label: "3개월", months: 3, bucket: "week" },
  { key: "m6", label: "6개월", months: 6, bucket: "week" },
  { key: "all", label: "전체", months: 0, bucket: "week" },
];

export default function StatsPage() {
  // useSearchParams 는 Suspense 경계 안에 있어야 한다 (Next 의 요구)
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Stats />
    </Suspense>
  );
}

function Stats() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("exercise");
  const [period, setPeriod] = useState<PeriodKey>("m3");
  const [pickedExercise, setPickedExercise] = useState<string | null>(() =>
    params.get("exercise"),
  );
  const [pickedPart, setPickedPart] = useState<BodyPart>("chest");
  const [pickerOpen, setPickerOpen] = useState(false);

  const spec = PERIODS.find((p) => p.key === period)!;
  const from =
    spec.months === 0 ? "0000-01-01" : toDateKey(subMonths(new Date(), spec.months));
  const to = todayKey();

  const sets = useLiveQuery(() => listDatedSets(from, to), [from, to]);
  const exercises = useLiveQuery(() => listExercises(), []);

  const byId = useMemo(
    () => new Map((exercises ?? []).map((e) => [e.id, e])),
    [exercises],
  );

  // 고른 게 없으면 이 기간에 가장 많이 한 종목을 먼저 보여준다
  const fallbackId = useMemo(() => busiestExerciseId(sets ?? []), [sets]);
  const exerciseId = pickedExercise ?? fallbackId;
  const exercise = exerciseId ? byId.get(exerciseId) : undefined;

  if (sets === undefined || exercises === undefined) {
    return (
      <>
        <PageHeader title="통계" />
        <LoadingBlock />
      </>
    );
  }

  return (
    <>
      <PageHeader title="통계" />

      {/* 필터는 아래 그래프 전부에 함께 걸리므로 한 곳에 모아 위에 둔다 */}
      <div className="space-y-2 px-4 py-3">
        <div className="grid grid-cols-2 gap-1.5">
          <Segment active={mode === "exercise"} onClick={() => setMode("exercise")}>
            종목별
          </Segment>
          <Segment active={mode === "part"} onClick={() => setMode("part")}>
            부위별
          </Segment>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {PERIODS.map((p) => (
            <Segment
              key={p.key}
              active={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </Segment>
          ))}
        </div>
      </div>

      <main className="flex-1 space-y-4 px-4 pb-4">
        {sets.length === 0 ? (
          <EmptyState
            icon={<TrendingUp size={28} />}
            title="이 기간에 기록이 없습니다"
            description="운동을 기록하면 여기에 추이가 쌓입니다."
          />
        ) : mode === "exercise" ? (
          <ExerciseView
            sets={sets}
            exerciseId={exerciseId}
            exercise={exercise}
            bucket={spec.bucket}
            onOpenPicker={() => setPickerOpen(true)}
          />
        ) : (
          <PartView
            sets={sets}
            byId={byId}
            part={pickedPart}
            onPickPart={setPickedPart}
            bucket={spec.bucket}
          />
        )}
      </main>

      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="종목 선택"
        tall
      >
        <ExerciseBrowser
          exercises={exercises}
          onPick={(picked) => {
            setPickedExercise(picked.id);
            setPickerOpen(false);
          }}
          emptyMessage="검색 결과가 없습니다."
        />
      </Sheet>
    </>
  );
}

function ExerciseView({
  sets,
  exerciseId,
  exercise,
  bucket,
  onOpenPicker,
}: {
  sets: DatedSet[];
  exerciseId: string | null;
  exercise: Exercise | undefined;
  bucket: Bucket;
  onOpenPicker: () => void;
}) {
  const points = exerciseId ? exerciseTrend(sets, exerciseId, bucket) : [];
  const days = exerciseId ? exerciseDays(sets, exerciseId) : [];
  const sum = totals(days.flatMap((d) => d.sets));
  const best = days.reduce<(typeof days)[number] | null>(
    (top, day) => (top === null || day.maxWeightKg > top.maxWeightKg ? day : top),
    null,
  );
  const color = exercise
    ? BODY_PART_COLOR[exercise.bodyPart]
    : "var(--color-accent)";

  return (
    <>
      <button
        type="button"
        onClick={onOpenPicker}
        className="flex h-12 w-full items-center gap-2 rounded-xl border border-border bg-surface px-4 text-left"
      >
        <span className="min-w-0 flex-1 truncate font-medium">
          {exercise?.name ?? "종목 선택"}
        </span>
        <ChevronDown size={18} className="shrink-0 text-muted" />
      </button>

      {points.length === 0 ? (
        <EmptyState
          title="이 기간에 이 종목 기록이 없습니다"
          description="기간을 늘리거나 다른 종목을 골라보세요."
        />
      ) : (
        <>
          <TrendChart points={points} color={color} />

          <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted tabular-nums">
            {days.length}일 · {Math.round(sum.volume).toLocaleString()}kg ·{" "}
            {sum.setCount}세트
            {best && best.maxWeightKg > 0 ? (
              <>
                {" · 최고 "}
                <span className="text-text">{Math.round(best.maxWeightKg)}kg</span>
                {` (${formatDateKo(best.date)})`}
              </>
            ) : null}
          </p>

          {/* 그래프에 찍힌 값은 여기서도 전부 읽힌다 — 툴팁이 유일한 통로가 되면 안 된다 */}
          <section>
            <h2 className="mb-2 px-1 text-sm font-medium text-muted">날짜별</h2>
            <ul className="space-y-2">
              {days.map((day) => (
                <li
                  key={day.date}
                  className="rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <div className="flex items-baseline gap-2 text-sm tabular-nums">
                    <span className="font-medium">{formatDateKo(day.date)}</span>
                    <span className="ml-auto text-muted">
                      {Math.round(day.volume).toLocaleString()}kg · {day.reps}회
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted tabular-nums">
                    {day.sets.map((s) => `${formatSetWeight(s)}×${s.reps}`).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

function PartView({
  sets,
  byId,
  part,
  onPickPart,
  bucket,
}: {
  sets: DatedSet[];
  byId: Map<string, Exercise>;
  part: BodyPart;
  onPickPart: (next: BodyPart) => void;
  bucket: Bucket;
}) {
  const points = bodyPartTrend(sets, byId, part, bucket);
  const shares = bodyPartTotals(sets, byId);
  const maxShare = shares[0]?.volume ?? 0;
  const allVolume = shares.reduce((n, s) => n + s.volume, 0);

  return (
    <>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
        {BODY_PARTS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPickPart(p.key)}
            className={`h-8 shrink-0 rounded-full border px-3 text-sm transition ${
              part === p.key
                ? "border-transparent font-medium text-bg"
                : "border-border bg-surface-2 text-muted"
            }`}
            style={part === p.key ? { background: p.color } : undefined}
          >
            {p.label}
          </button>
        ))}
      </div>

      {points.length === 0 ? (
        <EmptyState
          title={`이 기간에 ${BODY_PART_LABEL[part]} 기록이 없습니다`}
          description="기간을 늘리거나 다른 부위를 골라보세요."
        />
      ) : (
        <TrendChart points={points} color={BODY_PART_COLOR[part]} />
      )}

      <section>
        <h2 className="mb-2 px-1 text-sm font-medium text-muted">부위별 비중</h2>
        <ul className="space-y-2">
          {shares.map((share) => (
            <li key={share.part} className="flex items-center gap-3">
              {/* 색만으로 부위를 가르지 않는다 — 이름이 늘 옆에 붙는다 */}
              <span className="w-8 shrink-0 text-xs text-muted">
                {BODY_PART_LABEL[share.part]}
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${maxShare > 0 ? (share.volume / maxShare) * 100 : 0}%`,
                    background: BODY_PART_COLOR[share.part],
                  }}
                />
              </span>
              <span className="w-24 shrink-0 text-right text-xs text-muted tabular-nums">
                {Math.round(share.volume).toLocaleString()}kg
                {allVolume > 0
                  ? ` (${Math.round((share.volume / allVolume) * 100)}%)`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-xl border text-sm transition ${
        active
          ? "border-transparent bg-text font-semibold text-bg"
          : "border-border bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}
