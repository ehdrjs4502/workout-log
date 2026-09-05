import type { HydratedSession, HydratedSessionExercise } from "@/lib/db/repo";
import type { SetLog } from "@/lib/db/schema";
import { formatWeight } from "@/lib/format/date";

/**
 * "이 세트는 결국 몇 kg 을 들었나" 를 정하는 단 한 곳.
 *
 *   weightKg     = 바/덤벨/딥벨트에 얹은 추가 중량 (null = 없음)
 *   bodyWeightKg = 맨몸 종목일 때, 그 세트를 기록한 시점의 몸무게 스냅샷 (null = 해당 없음)
 *
 * 몸무게를 세션이 아니라 세트에 박아두는 이유: 설정에서 몸무게를 고쳐도
 * 지난 기록의 볼륨이 따라 흔들리면 안 된다. 기록은 그때의 사실 그대로 남는다.
 */
export type WeighedSet = Pick<SetLog, "weightKg" | "bodyWeightKg">;
type CountedSet = WeighedSet & Pick<SetLog, "reps">;

export const setLoadKg = (set: WeighedSet) =>
  (set.weightKg ?? 0) + (set.bodyWeightKg ?? 0);

export const setVolume = (set: CountedSet) => setLoadKg(set) * set.reps;

export const sumVolume = (sets: CountedSet[]) =>
  sets.reduce((sum, set) => sum + setVolume(set), 0);

export const itemVolume = (item: HydratedSessionExercise) => sumVolume(item.sets);

export const sessionVolume = (session: HydratedSession) =>
  session.items.reduce((sum, item) => sum + sumVolume(item.sets), 0);

/**
 * 세트들에 찍힌 몸무게 스냅샷. 값이 하나로 모일 때만 돌려준다.
 * (몸무게를 바꾼 뒤 이어서 기록한 경우처럼 섞여 있으면 표시하지 않는다)
 */
export function bodyWeightOf(sets: WeighedSet[]): number | null {
  const seen = new Set(
    sets.map((s) => s.bodyWeightKg).filter((v): v is number => v !== null),
  );
  return seen.size === 1 ? [...seen][0] : null;
}

export const sessionBodyWeight = (session: HydratedSession) =>
  bodyWeightOf(session.items.flatMap((i) => i.sets));

/** "60kg" / "맨몸" / "맨몸+20kg" */
export function formatSetWeight(set: WeighedSet): string {
  if (set.weightKg === null) return "맨몸";
  return set.bodyWeightKg === null
    ? `${formatWeight(set.weightKg)}kg`
    : `맨몸+${formatWeight(set.weightKg)}kg`;
}
