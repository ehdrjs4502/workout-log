"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sheet } from "./Sheet";
import { Button, Toggle } from "./ui";
import { Stepper } from "./Stepper";
import { BODY_PARTS, type BodyPart, type Exercise } from "@/lib/db/schema";
import { createExercise, getSettings, updateExercise } from "@/lib/db/repo";

/**
 * 종목 추가 / 수정 폼. exercise 가 있으면 수정 모드.
 *
 * 폼 본문을 별도 컴포넌트로 두고 닫힐 때 통째로 언마운트시킨다.
 * 그래야 다시 열었을 때 입력값이 자연스럽게 초기화된다 — 리셋용 effect 가 필요 없다.
 */
export function ExerciseFormSheet({
  open,
  onClose,
  exercise,
  defaultName = "",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  exercise?: Exercise;
  defaultName?: string;
  onSaved?: (id: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={exercise ? "종목 수정" : "종목 추가"}>
      <ExerciseForm
        key={exercise?.id ?? "new"}
        exercise={exercise}
        defaultName={defaultName}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Sheet>
  );
}

function ExerciseForm({
  exercise,
  defaultName,
  onClose,
  onSaved,
}: {
  exercise?: Exercise;
  defaultName: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const settings = useLiveQuery(() => getSettings(), []);

  const [name, setName] = useState(exercise?.name ?? defaultName);
  const [bodyPart, setBodyPart] = useState<BodyPart>(exercise?.bodyPart ?? "chest");
  const [restSec, setRestSec] = useState<number | null>(
    exercise?.defaultRestSec ?? null,
  );
  const [usesBodyWeight, setUsesBodyWeight] = useState(
    exercise?.usesBodyWeight ?? false,
  );

  // 새 종목이면 설정의 기본값을 쓰되, 사용자가 한 번이라도 만지면 그 값을 존중한다
  const effectiveRest = restSec ?? settings?.defaultRestSec ?? 90;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (exercise) {
      await updateExercise(exercise.id, {
        name: trimmed,
        bodyPart,
        defaultRestSec: effectiveRest,
        usesBodyWeight,
      });
      onSaved?.(exercise.id);
    } else {
      const id = await createExercise({
        name: trimmed,
        bodyPart,
        defaultRestSec: effectiveRest,
        usesBodyWeight,
      });
      onSaved?.(id);
    }
    onClose();
  };

  return (
    <div className="space-y-5 p-4">
      <div>
        <label htmlFor="ex-name" className="mb-1.5 block text-xs text-muted">
          이름
        </label>
        <input
          id="ex-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 인클라인 덤벨프레스"
          className="h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-base outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-xs text-muted">부위</span>
        <div className="grid grid-cols-3 gap-2">
          {BODY_PARTS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setBodyPart(p.key)}
              className={`h-11 rounded-xl border text-sm transition ${
                bodyPart === p.key
                  ? "border-transparent font-semibold text-bg"
                  : "border-border bg-surface-2 text-muted"
              }`}
              style={bodyPart === p.key ? { background: p.color } : undefined}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Stepper
        label="기본 휴식 시간 (초)"
        value={effectiveRest}
        onChange={setRestSec}
        step={15}
        min={15}
        max={600}
      />

      <Toggle
        label="맨몸 운동"
        note="풀업·딥스처럼 몸을 들어올리는 종목. 볼륨에 설정의 몸무게가 더해집니다"
        checked={usesBodyWeight}
        onChange={setUsesBodyWeight}
      />

      <div className="flex gap-2 pt-1">
        <Button className="flex-1" size="lg" onClick={onClose}>
          취소
        </Button>
        <Button
          className="flex-1"
          size="lg"
          variant="primary"
          onClick={save}
          disabled={!name.trim()}
        >
          저장
        </Button>
      </div>
    </div>
  );
}
