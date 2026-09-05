"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Dumbbell, Pencil, Plus } from "lucide-react";
import { Button, EmptyState, LoadingBlock, PageHeader } from "@/components/ui";
import { ElapsedClock } from "@/components/session/ElapsedClock";
import { ExerciseLogCard } from "@/components/session/ExerciseLogCard";
import { ExercisePickerSheet } from "@/components/session/ExercisePickerSheet";
import { RestTimerBar } from "@/components/session/RestTimerBar";
import {
  addExerciseToSession,
  deleteSession,
  endSession,
  getSettings,
  loadSession,
} from "@/lib/db/repo";
import { useWakeLock } from "@/lib/timer/useWakeLock";
import { formatDateFullKo } from "@/lib/format/date";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const session = useLiveQuery(() => loadSession(id), [id]);
  const settings = useLiveQuery(() => getSettings(), []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingPast, setEditingPast] = useState(false);

  const inProgress = session?.endedAt === 0;
  const readOnly = !inProgress && !editingPast;

  useWakeLock(!!inProgress && !!settings?.wakeLockEnabled);

  if (session === undefined) {
    return (
      <>
        <PageHeader title="운동" back="/" />
        <LoadingBlock />
      </>
    );
  }

  if (session === null) {
    return (
      <>
        <PageHeader title="운동" back="/" />
        <EmptyState
          title="기록을 찾을 수 없습니다"
          description="삭제되었거나 잘못된 주소입니다."
          action={
            <Button onClick={() => router.replace("/")}>홈으로</Button>
          }
        />
      </>
    );
  }

  const totalSets = session.items.reduce((n, i) => n + i.sets.length, 0);

  const finish = async () => {
    if (totalSets === 0) {
      if (!confirm("기록된 세트가 없습니다. 이 운동을 지울까요?")) return;
      await deleteSession(session.id);
      router.replace("/");
      return;
    }
    if (!confirm("운동을 종료할까요?")) return;
    await endSession(session.id);
    router.replace("/");
  };

  return (
    <>
      <PageHeader
        title={formatDateFullKo(session.date)}
        subtitle={undefined}
        back="/"
        action={
          inProgress ? (
            <Button size="sm" variant="primary" onClick={finish}>
              종료
            </Button>
          ) : (
            <Button
              size="sm"
              variant={editingPast ? "primary" : "surface"}
              onClick={() => setEditingPast((v) => !v)}
            >
              <Pencil size={14} />
              {editingPast ? "완료" : "편집"}
            </Button>
          )
        }
      />

      <div className="flex items-center gap-4 border-b border-border px-4 py-2.5 text-sm">
        <span className="font-mono text-base font-semibold">
          <ElapsedClock startedAt={session.startedAt} endedAt={session.endedAt} />
        </span>
        <span className="text-muted tabular-nums">
          {session.items.length}종목 · {totalSets}세트
        </span>
        {inProgress ? (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-success">
            <span className="size-1.5 rounded-full bg-success" />
            진행 중
          </span>
        ) : null}
      </div>

      <main className="flex-1 space-y-3 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {session.items.length === 0 ? (
          <EmptyState
            icon={<Dumbbell size={32} />}
            title="아직 종목이 없습니다"
            description="오늘 할 운동을 추가해 주세요."
          />
        ) : (
          session.items.map((item) => (
            <ExerciseLogCard
              key={item.id}
              sessionId={session.id}
              item={item}
              readOnly={readOnly}
            />
          ))
        )}

        {!readOnly ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted active:bg-surface"
          >
            <Plus size={18} />
            종목 추가
          </button>
        ) : null}

        {!inProgress ? (
          <button
            type="button"
            onClick={async () => {
              if (!confirm("이 날의 운동 기록을 삭제할까요?")) return;
              await deleteSession(session.id);
              router.replace("/calendar");
            }}
            className="mt-6 w-full py-3 text-center text-sm text-muted active:text-danger"
          >
            이 기록 삭제
          </button>
        ) : null}
      </main>

      <RestTimerBar />

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={async (exerciseId) => {
          await addExerciseToSession(session.id, exerciseId);
        }}
      />
    </>
  );
}
