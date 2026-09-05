"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { ExerciseBrowser } from "@/components/ExerciseBrowser";
import { ExerciseFormSheet } from "@/components/ExerciseFormSheet";
import { listExercises } from "@/lib/db/repo";

/** 세션에 넣을 종목 고르기. 목록에 없으면 이 자리에서 바로 만들 수 있다. */
export function ExercisePickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exerciseId: string) => void | Promise<void>;
}) {
  const exercises = useLiveQuery(() => listExercises(), []);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <Sheet open={open} onClose={onClose} title="종목 추가" tall>
        <ExerciseBrowser
          exercises={exercises ?? []}
          onPick={async (exercise) => {
            await onPick(exercise.id);
            onClose();
          }}
          emptyMessage="검색 결과가 없습니다. 아래에서 새로 만들 수 있어요."
          footer={
            <div className="p-4">
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted active:bg-surface-2"
              >
                <Plus size={16} />새 종목 만들기
              </button>
            </div>
          }
        />
      </Sheet>

      <ExerciseFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={async (id) => {
          await onPick(id);
          onClose();
        }}
      />
    </>
  );
}
