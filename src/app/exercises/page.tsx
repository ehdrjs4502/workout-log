"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, Button, LoadingBlock } from "@/components/ui";
import { ExerciseBrowser } from "@/components/ExerciseBrowser";
import { ExerciseFormSheet } from "@/components/ExerciseFormSheet";
import { deleteExercise, listExercises } from "@/lib/db/repo";
import type { Exercise } from "@/lib/db/schema";

export default function ExercisesPage() {
  const exercises = useLiveQuery(() => listExercises(), []);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | undefined>();

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (exercise: Exercise) => {
    setEditing(exercise);
    setFormOpen(true);
  };

  const remove = async (exercise: Exercise) => {
    if (!confirm(`"${exercise.name}"을(를) 목록에서 지울까요?\n이미 기록된 세트는 그대로 남습니다.`))
      return;
    await deleteExercise(exercise.id);
  };

  return (
    <>
      <PageHeader
        title="종목"
        subtitle={exercises ? `${exercises.length}개` : undefined}
        action={
          <Button size="sm" variant="primary" onClick={openAdd}>
            <Plus size={16} />
            추가
          </Button>
        }
      />

      {!exercises ? (
        <LoadingBlock />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ExerciseBrowser
            exercises={exercises}
            onPick={openEdit}
            renderTrailing={(exercise) => (
              <>
                <button
                  type="button"
                  aria-label={`${exercise.name} 수정`}
                  onClick={() => openEdit(exercise)}
                  className="p-2.5 text-muted"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`${exercise.name} 삭제`}
                  onClick={() => remove(exercise)}
                  className="p-2.5 text-muted"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            emptyMessage="검색 결과가 없습니다."
          />
        </div>
      )}

      <ExerciseFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        exercise={editing}
      />
    </>
  );
}
