"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Timer, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { SetInputPanel, type SetValues } from "./SetInputPanel";
import {
  deleteSet,
  lastSetOfExercise,
  removeSessionExercise,
  updateSet,
  type HydratedSessionExercise,
} from "@/lib/db/repo";
import { cancelTimerIfPointsTo, completeSet } from "@/lib/session/actions";
import { unlockAudio } from "@/lib/timer/alert";
import { BODY_PART_COLOR, type SetLog } from "@/lib/db/schema";
import { formatClock, formatWeight } from "@/lib/format/date";
import { bodyWeightOf, formatSetWeight, itemVolume } from "@/lib/stats/volume";

export function ExerciseLogCard({
  sessionId,
  item,
  readOnly,
}: {
  sessionId: string;
  item: HydratedSessionExercise;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<SetLog | null>(null);

  // 이 종목의 첫 세트일 때만 "지난 세션" 기록을 끌어온다
  const previous = useLiveQuery(
    () =>
      item.sets.length === 0
        ? lastSetOfExercise(item.exerciseId, item.id)
        : Promise.resolve(undefined),
    [item.sets.length, item.exerciseId, item.id],
  );

  const usesBodyWeight = item.exercise?.usesBodyWeight ?? false;

  const lastSet = item.sets.at(-1);
  const source = lastSet ?? previous;
  const defaults: SetValues = {
    // 지난 기록이 맨몸이었으면 0(= 맨몸)에서 시작해야 한다. 20kg 로 튀면 안 된다.
    weightKg: source ? (source.weightKg ?? 0) : usesBodyWeight ? 0 : 20,
    reps: source?.reps ?? 10,
    rpe: lastSet?.rpe ?? null,
  };

  const volume = itemVolume(item);
  // 세트에 박힌 몸무게 스냅샷. 볼륨이 왜 그 숫자인지 여기서 드러난다.
  const bodyWeight = bodyWeightOf(item.sets);

  const onCompleteSet = async (values: SetValues) => {
    // iOS 오디오 잠금 해제는 반드시 사용자 제스처 안에서, await 보다 먼저
    unlockAudio();
    await completeSet({
      sessionId,
      sessionExerciseId: item.id,
      exerciseId: item.exerciseId,
      weightKg: values.weightKg === 0 ? null : values.weightKg,
      reps: values.reps,
      rpe: values.rpe,
      usesBodyWeight,
      restTargetSec: item.exercise?.defaultRestSec ?? 90,
    });
  };

  const onRemoveExercise = async () => {
    if (
      !confirm(
        `"${item.exercise?.name ?? "이 종목"}"을(를) 이번 운동에서 뺄까요?\n기록된 ${item.sets.length}세트도 함께 지워집니다.`,
      )
    )
      return;
    await removeSessionExercise(item.id);
  };

  return (
    <Card className="overflow-hidden">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{
            background: item.exercise
              ? BODY_PART_COLOR[item.exercise.bodyPart]
              : "var(--color-muted)",
          }}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">
            {item.exercise?.name ?? "삭제된 종목"}
          </h2>
          <p className="text-xs text-muted tabular-nums">
            {item.sets.length}세트
            {volume > 0 ? ` · ${Math.round(volume).toLocaleString()}kg` : ""}
            {bodyWeight !== null ? ` · 체중 ${formatWeight(bodyWeight)}kg` : ""}
          </p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            aria-label="종목 빼기"
            onClick={onRemoveExercise}
            className="-mr-2 p-2 text-muted"
          >
            <Trash2 size={16} />
          </button>
        ) : null}
      </header>

      {item.sets.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {item.sets.map((set, i) => (
            <li key={set.id}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setEditing(set)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:cursor-default"
              >
                <span className="w-5 shrink-0 text-sm tabular-nums text-muted">
                  {i + 1}
                </span>
                <span className="flex-1 text-[15px] tabular-nums">
                  {formatSetWeight(set)}
                  <span className="text-muted"> × </span>
                  {set.reps}
                </span>
                {set.rpe !== null ? (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs tabular-nums text-muted">
                    RPE {set.rpe}
                  </span>
                ) : null}
                {set.restSec !== null ? (
                  <span className="flex w-14 shrink-0 items-center justify-end gap-1 text-xs tabular-nums text-muted">
                    <Timer size={12} />
                    {formatClock(set.restSec)}
                  </span>
                ) : (
                  <span className="w-14 shrink-0" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!readOnly ? (
        <div className="border-t border-border bg-surface-2/30 p-3">
          <SetInputPanel
            defaults={defaults}
            usesBodyWeight={usesBodyWeight}
            submitLabel={`${item.sets.length + 1}세트 완료`}
            hint={
              item.sets.length === 0 && previous
                ? `지난 기록 ${formatSetWeight(previous)} × ${previous.reps}`
                : undefined
            }
            onSubmit={onCompleteSet}
          />
        </div>
      ) : null}

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`${item.exercise?.name ?? ""} 세트 수정`}
      >
        {editing ? (
          <div className="p-4">
            <SetInputPanel
              defaults={{
                weightKg: editing.weightKg ?? 0,
                reps: editing.reps,
                rpe: editing.rpe,
              }}
              usesBodyWeight={usesBodyWeight}
              submitLabel="저장"
              onSubmit={async (values) => {
                await updateSet(editing.id, {
                  weightKg: values.weightKg === 0 ? null : values.weightKg,
                  reps: values.reps,
                  rpe: values.rpe,
                });
                setEditing(null);
              }}
              onDelete={async () => {
                await deleteSet(editing.id);
                await cancelTimerIfPointsTo(editing.id);
                setEditing(null);
              }}
            />
          </div>
        ) : null}
      </Sheet>
    </Card>
  );
}
