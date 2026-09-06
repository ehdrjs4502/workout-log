import Dexie from "dexie";
import { db, newId, nowMeta } from "./index";
import { todayKey } from "@/lib/format/date";
import {
  ALIVE,
  DEFAULT_SETTINGS,
  type BodyPart,
  type Exercise,
  type RestTimerState,
  type Session,
  type SessionExercise,
  type SetLog,
  type Settings,
} from "./schema";

/* ------------------------------------------------------------------ *
 * 규칙: 화면 코드는 db.table.put() 을 직접 부르지 않는다.
 * 삭제는 전부 soft delete, 쓰기는 전부 updatedAt 갱신 — 여기서만 강제한다.
 * ------------------------------------------------------------------ */

const touch = () => ({ updatedAt: Date.now() });

/* ---------------------------------- 종목 ---------------------------------- */

export function listExercises() {
  return db.exercises.where("deletedAt").equals(ALIVE).sortBy("name");
}

export async function createExercise(input: {
  name: string;
  bodyPart: BodyPart;
  defaultRestSec?: number;
  usesBodyWeight?: boolean;
}): Promise<string> {
  const id = newId();
  await db.exercises.add({
    id,
    name: input.name.trim(),
    bodyPart: input.bodyPart,
    isCustom: true,
    defaultRestSec: input.defaultRestSec ?? 90,
    usesBodyWeight: input.usesBodyWeight ?? false,
    ...nowMeta(),
  });
  return id;
}

export function updateExercise(id: string, patch: Partial<Omit<Exercise, "id">>) {
  return db.exercises.update(id, { ...patch, ...touch() });
}

export function deleteExercise(id: string) {
  return db.exercises.update(id, { deletedAt: Date.now(), ...touch() });
}

/* --------------------------------- 세션 ---------------------------------- */

/** 진행 중(endedAt === 0)인 세션. 앱 재시작 후 이어서 하기의 근거. */
export async function getActiveSession(): Promise<Session | undefined> {
  return db.sessions.where("[deletedAt+endedAt]").equals([ALIVE, 0]).first();
}

export async function startSession(date = todayKey()): Promise<string> {
  const existing = await getActiveSession();
  if (existing) return existing.id;

  const id = newId();
  await db.sessions.add({
    id,
    date,
    startedAt: Date.now(),
    endedAt: 0,
    ...nowMeta(),
  });
  return id;
}

export async function endSession(sessionId: string) {
  // 쉬던 도중에 운동을 끝내도 그 휴식 시간은 직전 세트에 남긴다
  await finalizeRestTimer();
  await db.sessions.update(sessionId, { endedAt: Date.now(), ...touch() });
}

export function reopenSession(sessionId: string) {
  return db.sessions.update(sessionId, { endedAt: 0, ...touch() });
}

export function getSession(sessionId: string) {
  return db.sessions.get(sessionId);
}

export function listSessionsBetween(fromKey: string, toKey: string) {
  return db.sessions
    .where("[deletedAt+date]")
    .between([ALIVE, fromKey], [ALIVE, toKey], true, true)
    .toArray();
}

export async function listRecentSessions(limit = 3): Promise<Session[]> {
  const rows = await db.sessions.where("deletedAt").equals(ALIVE).toArray();
  return rows.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}

export async function deleteSession(sessionId: string) {
  const deletedAt = Date.now();
  const items = await db.sessionExercises
    .where("[sessionId+deletedAt]")
    .equals([sessionId, ALIVE])
    .toArray();

  await db.transaction("rw", db.sessions, db.sessionExercises, db.setLogs, async () => {
    await db.sessions.update(sessionId, { deletedAt, updatedAt: deletedAt });
    for (const item of items) {
      await db.sessionExercises.update(item.id, { deletedAt, updatedAt: deletedAt });
      await db.setLogs
        .where("[sessionExerciseId+deletedAt]")
        .equals([item.id, ALIVE])
        .modify({ deletedAt, updatedAt: deletedAt });
    }
  });
}

/* ------------------------- 세션 안의 종목 / 세트 ------------------------- */

export async function addExerciseToSession(sessionId: string, exerciseId: string) {
  const siblings = await db.sessionExercises
    .where("[sessionId+deletedAt]")
    .equals([sessionId, ALIVE])
    .toArray();

  const id = newId();
  await db.sessionExercises.add({
    id,
    sessionId,
    exerciseId,
    order: siblings.length,
    ...nowMeta(),
  });
  return id;
}

export async function removeSessionExercise(sessionExerciseId: string) {
  const deletedAt = Date.now();
  await db.transaction("rw", db.sessionExercises, db.setLogs, async () => {
    await db.sessionExercises.update(sessionExerciseId, { deletedAt, updatedAt: deletedAt });
    await db.setLogs
      .where("[sessionExerciseId+deletedAt]")
      .equals([sessionExerciseId, ALIVE])
      .modify({ deletedAt, updatedAt: deletedAt });
  });
}

export async function addSet(input: {
  sessionExerciseId: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number;
  rpe?: number | null;
  /** 맨몸 종목이면 지금 설정된 몸무게를 이 세트에 박아둔다 */
  usesBodyWeight?: boolean;
}): Promise<string> {
  const siblings = await db.setLogs
    .where("[sessionExerciseId+deletedAt]")
    .equals([input.sessionExerciseId, ALIVE])
    .toArray();

  const bodyWeightKg = input.usesBodyWeight
    ? ((await getSettings()).bodyWeightKg ?? null)
    : null;

  const id = newId();
  await db.setLogs.add({
    id,
    sessionExerciseId: input.sessionExerciseId,
    exerciseId: input.exerciseId,
    order: siblings.length,
    weightKg: input.weightKg,
    bodyWeightKg,
    reps: input.reps,
    rpe: input.rpe ?? null,
    restSec: null,
    completedAt: Date.now(),
    ...nowMeta(),
  });
  return id;
}

export function updateSet(id: string, patch: Partial<Omit<SetLog, "id">>) {
  return db.setLogs.update(id, { ...patch, ...touch() });
}

export function deleteSet(id: string) {
  return db.setLogs.update(id, { deletedAt: Date.now(), ...touch() });
}

/**
 * 해당 종목을 마지막으로 수행했을 때의 마지막 세트.
 * SetLog 에 exerciseId 를 비정규화해둔 덕에 join 없이 인덱스 한 방으로 끝난다.
 */
export async function lastSetOfExercise(
  exerciseId: string,
  excludeSessionExerciseId?: string,
): Promise<SetLog | undefined> {
  const rows = await db.setLogs
    .where("[exerciseId+completedAt]")
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .reverse()
    .filter(
      (s) => s.deletedAt === ALIVE && s.sessionExerciseId !== excludeSessionExerciseId,
    )
    .limit(1)
    .toArray();
  return rows[0];
}

/* ------------------------------ 조합 조회 ------------------------------ */

export type HydratedSessionExercise = SessionExercise & {
  exercise: Exercise | undefined;
  sets: SetLog[];
};

export type HydratedSession = Session & {
  items: HydratedSessionExercise[];
};

/** 로깅 화면 / 캘린더 상세 / 텍스트 내보내기가 전부 이 함수를 공유한다. */
export async function loadSession(sessionId: string): Promise<HydratedSession | null> {
  const session = await db.sessions.get(sessionId);
  if (!session || session.deletedAt !== ALIVE) return null;

  const links = (
    await db.sessionExercises
      .where("[sessionId+deletedAt]")
      .equals([sessionId, ALIVE])
      .toArray()
  ).sort((a, b) => a.order - b.order);

  const exerciseIds = [...new Set(links.map((l) => l.exerciseId))];
  const exercises = await db.exercises.bulkGet(exerciseIds);
  const exerciseMap = new Map(
    exercises.filter((e): e is Exercise => !!e).map((e) => [e.id, e]),
  );

  const items: HydratedSessionExercise[] = [];
  for (const link of links) {
    const sets = (
      await db.setLogs
        .where("[sessionExerciseId+deletedAt]")
        .equals([link.id, ALIVE])
        .toArray()
    ).sort((a, b) => a.order - b.order);
    items.push({ ...link, exercise: exerciseMap.get(link.exerciseId), sets });
  }
  return { ...session, items };
}

export async function loadSessions(sessionIds: string[]): Promise<HydratedSession[]> {
  const out: HydratedSession[] = [];
  for (const id of sessionIds) {
    const s = await loadSession(id);
    if (s) out.push(s);
  }
  return out;
}

/* -------------------------------- 설정 --------------------------------- */

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("app")) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>) {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: "app" });
}

/* ----------------------------- 휴식 타이머 ----------------------------- */

/**
 * 진행 중인 휴식 타이머. null = 없음.
 * useLiveQuery 에서 undefined(아직 로딩 중)와 구분해야 해서 명시적으로 돌려준다.
 */
export async function getRestTimer(): Promise<RestTimerState | null> {
  return (await db.restTimer.get("current")) ?? null;
}

export function setRestTimer(state: Omit<RestTimerState, "id">) {
  return db.restTimer.put({ ...state, id: "current" });
}

export function markRestTimerNotified() {
  return db.restTimer.update("current", { notified: true });
}

export function clearRestTimer() {
  return db.restTimer.delete("current");
}

/**
 * 돌고 있던 휴식을 "여기까지"로 확정한다.
 * 흐른 시간을 직전 세트의 restSec 에 쓰고 타이머를 지운다.
 * 그냥 clearRestTimer() 만 하면 그 세트의 휴식 시간이 영영 null 로 남는다.
 */
export async function finalizeRestTimer(): Promise<void> {
  const running = await db.restTimer.get("current");
  if (!running) return;

  const restSec = Math.max(0, Math.round((Date.now() - running.startedAt) / 1000));
  await db.setLogs.update(running.setLogId, { restSec, ...touch() });
  await db.restTimer.delete("current");
}
