"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui";
import { EQUIPMENT_STEP, type Equipment } from "@/lib/db/schema";

export type SetValues = {
  /** 0 = 맨몸 (저장 시 null 로 변환된다) */
  weightKg: number;
  reps: number;
  rpe: number | null;
};

const RPE_OPTIONS = [6, 7, 8, 9, 10];

/**
 * 세트 입력. 새 세트 추가와 기존 세트 수정이 같은 UI 를 쓴다.
 * 값은 항상 직전 세트로 프리필되어 있어서, 보통은 [세트 완료] 한 번만 누르면 된다.
 */
export function SetInputPanel({
  defaults,
  usesBodyWeight = false,
  equipment = "etc",
  submitLabel = "세트 완료",
  hint,
  onSubmit,
  onDelete,
}: {
  defaults: SetValues;
  /** 맨몸 종목이면 무게 칸은 '추가로 매단 중량' 이라는 뜻이 된다 */
  usesBodyWeight?: boolean;
  /** 무게 ± 버튼의 증감폭을 기구에 맞춘다 (머신·케이블 스택은 5kg 단위) */
  equipment?: Equipment;
  submitLabel?: string;
  hint?: string;
  onSubmit: (values: SetValues) => void | Promise<void>;
  onDelete?: () => void;
}) {
  const [weightKg, setWeight] = useState(defaults.weightKg);
  const [reps, setReps] = useState(defaults.reps);
  const [rpe, setRpe] = useState<number | null>(defaults.rpe);
  const [busy, setBusy] = useState(false);

  // 직전 세트가 바뀌면(= 세트를 하나 더 완료하면) 프리필 값도 따라 움직인다
  const signature = `${defaults.weightKg}|${defaults.reps}|${defaults.rpe}`;
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setWeight(defaults.weightKg);
    setReps(defaults.reps);
    setRpe(defaults.rpe);
  }

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit({ weightKg, reps, rpe });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {hint ? <p className="text-center text-xs text-muted">{hint}</p> : null}

      <div className="flex gap-2">
        <Stepper
          label={usesBodyWeight ? "추가 무게" : "무게"}
          value={weightKg}
          onChange={setWeight}
          step={EQUIPMENT_STEP[equipment]}
          max={500}
          suffix="kg"
          zeroLabel="맨몸"
          decimal
        />
        <Stepper
          label="횟수"
          value={reps}
          onChange={setReps}
          step={1}
          min={1}
          max={200}
          suffix="회"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-xs text-muted">RPE</span>
        <button
          type="button"
          onClick={() => setRpe(null)}
          className={`h-9 flex-1 rounded-lg border text-sm ${
            rpe === null
              ? "border-transparent bg-surface-2 font-medium text-text"
              : "border-border text-muted"
          }`}
        >
          —
        </button>
        {RPE_OPTIONS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setRpe(v)}
            className={`h-9 flex-1 rounded-lg border text-sm tabular-nums ${
              rpe === v
                ? "border-transparent bg-accent font-semibold text-accent-fg"
                : "border-border text-muted"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {onDelete ? (
          <Button variant="danger" size="lg" onClick={onDelete}>
            삭제
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={submit}
          disabled={busy}
        >
          <Check size={18} />
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
