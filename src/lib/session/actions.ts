import {
  addSet,
  clearRestTimer,
  finalizeRestTimer,
  getRestTimer,
  setRestTimer,
} from "@/lib/db/repo";

/**
 * 세트 하나를 확정한다. 요구사항 2번(세트별 휴식 기록)이 여기서 자동으로 만족된다.
 *
 * 1) 직전 세트를 마친 뒤 흐른 시간을 그 세트의 restSec 에 확정 기록
 * 2) 이번 세트 저장
 * 3) 새 휴식 타이머 시작
 *
 * 사용자는 휴식 시간을 따로 입력하지 않는다.
 */
export async function completeSet(params: {
  sessionId: string;
  sessionExerciseId: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number;
  rpe: number | null;
  /** 맨몸 종목 여부. 세트에 몸무게 스냅샷을 남길지 결정한다 */
  usesBodyWeight: boolean;
  restTargetSec: number;
}): Promise<string> {
  await finalizeRestTimer();

  const setId = await addSet({
    sessionExerciseId: params.sessionExerciseId,
    exerciseId: params.exerciseId,
    weightKg: params.weightKg,
    reps: params.reps,
    rpe: params.rpe,
    usesBodyWeight: params.usesBodyWeight,
  });

  await setRestTimer({
    sessionId: params.sessionId,
    setLogId: setId,
    startedAt: Date.now(),
    targetSec: params.restTargetSec,
    notified: false,
  });

  return setId;
}

/** 세트를 지웠는데 그 세트가 현재 타이머의 기준이면 타이머도 정리한다. */
export async function cancelTimerIfPointsTo(setLogId: string) {
  const running = await getRestTimer();
  if (running?.setLogId === setLogId) await clearRestTimer();
}
