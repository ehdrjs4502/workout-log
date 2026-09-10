import { format, startOfWeek } from "date-fns";
import type { DatedSet } from "@/lib/db/repo";
import type { BodyPart, Exercise } from "@/lib/db/schema";
import { setLoadKg, sumVolume } from "@/lib/stats/volume";

/**
 * 추이 그래프의 한 점.
 *
 * volume 과 reps 를 반드시 "같은 구간의 합계" 에서 뽑는다. 한쪽만 그날 최고 세트로
 * 잡으면 두 선이 반대로 움직인다 — 무게를 올린 날은 보통 횟수가 줄기 때문에
 * 60kg×10 에서 80kg×5 로 나아간 게 횟수 선에서는 후퇴로 읽힌다.
 */
export type TrendPoint = {
  /** 버킷의 시작 날짜 'YYYY-MM-DD' */
  date: string;
  /** 총 볼륨 (kg) */
  volume: number;
  /** 총 횟수 (회) */
  reps: number;
  setCount: number;
  /** 이 구간 최고 중량. 그래프가 아니라 아래 기록표에 쓴다 */
  maxWeightKg: number;
};

export type Bucket = "day" | "week";

/** 주 단위는 월요일에 모은다 */
const bucketKey = (date: string, bucket: Bucket) =>
  bucket === "day"
    ? date
    : format(startOfWeek(new Date(`${date}T00:00:00`), { weekStartsOn: 1 }), "yyyy-MM-dd");

function toPoint(date: string, sets: DatedSet[]): TrendPoint {
  return {
    date,
    volume: sumVolume(sets),
    reps: sets.reduce((n, s) => n + s.reps, 0),
    setCount: sets.length,
    maxWeightKg: sets.reduce((max, s) => Math.max(max, setLoadKg(s)), 0),
  };
}

/** 날짜(또는 주)별로 묶어 오름차순 TrendPoint 로. 기록이 없는 구간은 점을 만들지 않는다. */
function trend(sets: DatedSet[], bucket: Bucket): TrendPoint[] {
  const groups = new Map<string, DatedSet[]>();
  for (const set of sets) {
    const key = bucketKey(set.date, bucket);
    const list = groups.get(key);
    if (list) list.push(set);
    else groups.set(key, [set]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => toPoint(date, list));
}

export const exerciseTrend = (sets: DatedSet[], exerciseId: string, bucket: Bucket) =>
  trend(
    sets.filter((s) => s.exerciseId === exerciseId),
    bucket,
  );

export const bodyPartTrend = (
  sets: DatedSet[],
  byId: Map<string, Exercise>,
  part: BodyPart,
  bucket: Bucket,
) => trend(sets.filter((s) => byId.get(s.exerciseId)?.bodyPart === part), bucket);

/** 기간 전체 합계. 그래프 아래 요약 한 줄에 쓴다. */
export const totals = (sets: DatedSet[]): TrendPoint =>
  toPoint("", sets);

/** 그래프 아래 기록표 — 최근 날짜가 위로 온다 */
export const exerciseDays = (
  sets: DatedSet[],
  exerciseId: string,
): (TrendPoint & { sets: DatedSet[] })[] => {
  const mine = sets.filter((s) => s.exerciseId === exerciseId);
  const groups = new Map<string, DatedSet[]>();
  for (const set of mine) {
    const list = groups.get(set.date);
    if (list) list.push(set);
    else groups.set(set.date, [set]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({
      ...toPoint(date, list),
      sets: [...list].sort((a, b) => a.order - b.order),
    }));
};

/** 부위별 비중. 볼륨이 큰 순. 기간에 기록이 없는 부위는 빠진다. */
export function bodyPartTotals(
  sets: DatedSet[],
  byId: Map<string, Exercise>,
): { part: BodyPart; volume: number; reps: number; setCount: number }[] {
  const groups = new Map<BodyPart, DatedSet[]>();
  for (const set of sets) {
    const part = byId.get(set.exerciseId)?.bodyPart;
    if (!part) continue; // 종목이 하드 삭제된 경우 — 부위를 알 수 없으니 뺀다
    const list = groups.get(part);
    if (list) list.push(set);
    else groups.set(part, [set]);
  }
  return [...groups.entries()]
    .map(([part, list]) => {
      const point = toPoint("", list);
      return {
        part,
        volume: point.volume,
        reps: point.reps,
        setCount: point.setCount,
      };
    })
    .sort((a, b) => b.volume - a.volume);
}

/** 이 기간에 세트가 가장 많았던 종목. 통계 화면의 기본 선택. */
export function busiestExerciseId(sets: DatedSet[]): string | null {
  const counts = new Map<string, number>();
  for (const set of sets) {
    counts.set(set.exerciseId, (counts.get(set.exerciseId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}
