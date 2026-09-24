"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, Plus } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { ExerciseBrowser } from "@/components/ExerciseBrowser";
import { ExerciseFormSheet } from "@/components/ExerciseFormSheet";
import { EquipmentChoice } from "./EquipmentChoice";
import { getExercise, listExercises } from "@/lib/db/repo";
import type { Equipment, Exercise } from "@/lib/db/schema";

/**
 * 세션에 넣을 종목 고르기. 목록에 없으면 이 자리에서 바로 만들 수 있다.
 *
 * 종목 → 기구 두 단계다. 같은 벤치프레스라도 그날 바벨로 했는지 덤벨로 했는지는
 * 종목을 만들 때가 아니라 지금 정해진다.
 */
export function ExercisePickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exerciseId: string, equipment: Equipment) => void | Promise<void>;
}) {
  const exercises = useLiveQuery(() => listExercises(), []);
  const [formOpen, setFormOpen] = useState(false);
  const [picked, setPicked] = useState<Exercise | null>(null);

  // 다음에 열었을 때 기구 단계에서 시작하지 않도록 닫을 때 비운다
  const close = () => {
    setPicked(null);
    onClose();
  };

  return (
    <>
      <Sheet open={open} onClose={close} title="종목 추가" tall>
        {picked ? (
          <>
            <div className="flex items-center gap-1 border-b border-border px-2 py-2">
              <button
                type="button"
                aria-label="종목 다시 고르기"
                onClick={() => setPicked(null)}
                className="p-2 text-muted"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="min-w-0">
                <p className="truncate font-medium">{picked.name}</p>
                <p className="text-xs text-muted">어떤 기구로 하나요?</p>
              </div>
            </div>
            <EquipmentChoice
              current={picked.equipment}
              currentNote="지난번"
              onChoose={async (equipment) => {
                await onPick(picked.id, equipment);
                close();
              }}
            />
          </>
        ) : (
          <ExerciseBrowser
            exercises={exercises ?? []}
            onPick={setPicked}
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
        )}
      </Sheet>

      <ExerciseFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={async (id) => {
          // 새로 만든 종목도 기구는 고르게 한다
          const created = await getExercise(id);
          if (created) setPicked(created);
        }}
      />
    </>
  );
}
