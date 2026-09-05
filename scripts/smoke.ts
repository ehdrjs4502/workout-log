/**
 * 데이터 레이어 스모크 테스트.
 *
 * IndexedDB 복합 인덱스와 휴식 시간 귀속 로직은 브라우저 밖에서는 확인할 방법이 없어서
 * fake-indexeddb 로 대신 돌린다. 인덱스 문자열을 하나 잘못 쓰면 런타임에야 터지는데,
 * 그걸 헬스장에서 발견하고 싶지는 않다.
 *
 *   pnpm smoke
 */
import "fake-indexeddb/auto";

import Dexie from "dexie";

import { db, WorkoutDB } from "@/lib/db";
import {
  addExerciseToSession,
  endSession,
  getActiveSession,
  lastSetOfExercise,
  listExercises,
  listSessionsBetween,
  loadSession,
  startSession,
  updateSettings,
} from "@/lib/db/repo";
import { completeSet } from "@/lib/session/actions";
import { createBackup, restoreBackup, type Backup } from "@/lib/export/backup";
import { sessionsToText } from "@/lib/export/toText";
import { sessionVolume } from "@/lib/stats/volume";
import { todayKey } from "@/lib/format/date";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`);
  }
}

/** Date.now 를 고정해 휴식 시간을 결정적으로 만든다 */
const realNow = Date.now.bind(Date);
let clock = realNow();
Date.now = () => clock;
const advance = (sec: number) => {
  clock += sec * 1000;
};

async function main() {
  console.log("\n[1] 시딩");
  await db.open();
  const exercises = await listExercises();
  check("프리셋 종목이 들어갔다", exercises.length > 30, exercises.length);
  check("설정 레코드가 있다", (await db.settings.get("app")) !== undefined);

  console.log("\n[2] 세션 시작");
  const sessionId = await startSession();
  check("진행 중 세션을 인덱스로 찾는다", (await getActiveSession())?.id === sessionId);
  check("같은 세션이 중복 생성되지 않는다", (await startSession()) === sessionId);

  console.log("\n[3] 세트 기록과 휴식 시간 귀속");
  const bench = exercises.find((e) => e.name === "벤치프레스")!;
  const seId = await addExerciseToSession(sessionId, bench.id);

  await completeSet({
    sessionId,
    sessionExerciseId: seId,
    exerciseId: bench.id,
    weightKg: 60,
    reps: 10,
    rpe: 7,
    usesBodyWeight: false,
    restTargetSec: 90,
  });

  advance(95); // 1세트 후 95초 휴식
  await completeSet({
    sessionId,
    sessionExerciseId: seId,
    exerciseId: bench.id,
    weightKg: 60,
    reps: 9,
    rpe: 8,
    usesBodyWeight: false,
    restTargetSec: 90,
  });

  advance(120); // 2세트 후 120초 휴식
  await completeSet({
    sessionId,
    sessionExerciseId: seId,
    exerciseId: bench.id,
    weightKg: 55,
    reps: 8,
    rpe: 9,
    usesBodyWeight: false,
    restTargetSec: 90,
  });

  let loaded = (await loadSession(sessionId))!;
  let sets = loaded.items[0].sets;
  check("세트 3개가 순서대로 저장됐다", sets.length === 3 && sets[0].order === 0 && sets[2].order === 2);
  check("1세트 휴식 = 95초", sets[0].restSec === 95, sets[0].restSec);
  check("2세트 휴식 = 120초", sets[1].restSec === 120, sets[1].restSec);
  check("마지막 세트 휴식은 아직 미확정", sets[2].restSec === null, sets[2].restSec);

  console.log("\n[4] 지난 기록 프리필 조회");
  const last = await lastSetOfExercise(bench.id);
  check("가장 최근 세트를 집어온다", last?.weightKg === 55 && last?.reps === 8, last);
  check(
    "같은 세션은 제외할 수 있다",
    (await lastSetOfExercise(bench.id, seId)) === undefined,
  );

  console.log("\n[5] 세션 종료");
  advance(60); // 쉬던 중에 종료
  await endSession(sessionId);
  loaded = (await loadSession(sessionId))!;
  sets = loaded.items[0].sets;
  check("종료 시 마지막 휴식도 기록된다", sets[2].restSec === 60, sets[2].restSec);
  check("진행 중 세션이 사라졌다", (await getActiveSession()) === undefined);
  check("타이머가 정리됐다", (await db.restTimer.get("current")) === undefined);

  console.log("\n[6] 캘린더 범위 조회");
  const inMonth = await listSessionsBetween(todayKey(), todayKey());
  check("오늘 날짜로 세션이 조회된다", inMonth.length === 1 && inMonth[0].id === sessionId);

  console.log("\n[7] 텍스트 내보내기");
  const simple = sessionsToText([loaded], "simple");
  const detailed = sessionsToText([loaded], "detailed");
  check("간단 모드에 세트가 들어간다", simple.includes("벤치프레스 60kgx10, 60kgx9, 55kgx8"), simple);
  check("상세 모드에 RPE 가 들어간다", detailed.includes("RPE 7"));
  check("상세 모드에 휴식 시간이 들어간다", detailed.includes("휴식 1:35"), detailed);
  check("상세 모드에 총 볼륨이 들어간다", detailed.includes("총 볼륨 1,580kg"), detailed);

  console.log("\n[8] 백업 라운드트립");
  const backup = await createBackup();
  await restoreBackup(backup, "replace");
  const restored = (await loadSession(sessionId))!;
  check("복원 후 세션이 그대로다", restored.items[0].sets.length === 3);
  check("복원 후 휴식 시간도 그대로다", restored.items[0].sets[0].restSec === 95);
  check("복원 후 종목 수가 같다", (await listExercises()).length === exercises.length);

  console.log("\n[9] soft delete");
  const beforeDelete = (await listExercises()).length;
  await db.exercises.update(bench.id, { deletedAt: Date.now(), updatedAt: Date.now() });
  check("삭제된 종목은 목록에서 빠진다", (await listExercises()).length === beforeDelete - 1);
  check(
    "이미 기록된 세트는 남아 있다",
    (await loadSession(sessionId))!.items[0].sets.length === 3,
  );

  console.log("\n[10] 맨몸 운동 볼륨");
  await updateSettings({ bodyWeightKg: 75 });
  const pullup = (await listExercises()).find((e) => e.name === "풀업")!;
  check("프리셋 풀업은 맨몸 운동으로 들어간다", pullup.usesBodyWeight === true);

  const bwSession = await startSession();
  const bwSe = await addExerciseToSession(bwSession, pullup.id);
  await completeSet({
    sessionId: bwSession,
    sessionExerciseId: bwSe,
    exerciseId: pullup.id,
    weightKg: null,
    reps: 10,
    rpe: null,
    usesBodyWeight: true,
    restTargetSec: 150,
  });
  advance(150);
  await completeSet({
    sessionId: bwSession,
    sessionExerciseId: bwSe,
    exerciseId: pullup.id,
    weightKg: 20, // 딥벨트
    reps: 5,
    rpe: null,
    usesBodyWeight: true,
    restTargetSec: 150,
  });
  await endSession(bwSession);

  const bwLoaded = (await loadSession(bwSession))!;
  check(
    "세트에 몸무게 스냅샷이 박힌다",
    bwLoaded.items[0].sets[0].bodyWeightKg === 75,
    bwLoaded.items[0].sets[0].bodyWeightKg,
  );
  check(
    "맨몸 볼륨 = (체중 + 추가중량) x 횟수",
    sessionVolume(bwLoaded) === 75 * 10 + 95 * 5,
    sessionVolume(bwLoaded),
  );

  const bwText = sessionsToText([bwLoaded], "detailed");
  check("내보내기 머리말에 체중이 붙는다", bwText.includes("체중 75kg"), bwText);
  check("추가 중량은 맨몸+20kg 로 적힌다", bwText.includes("맨몸+20kg"), bwText);

  await updateSettings({ bodyWeightKg: 80 });
  check(
    "몸무게를 바꿔도 지난 기록의 볼륨은 그대로다",
    sessionVolume((await loadSession(bwSession))!) === 75 * 10 + 95 * 5,
  );

  console.log("\n[11] v1 백업 호환");
  const strip = <T extends object>(row: T, key: string): T => {
    const copy = { ...row } as unknown as Record<string, unknown>;
    delete copy[key];
    return copy as unknown as T;
  };
  const current = await createBackup();
  const asV1: Backup = {
    ...current,
    version: 1,
    exercises: current.exercises.map((e) => strip(e, "usesBodyWeight")),
    setLogs: current.setLogs.map((s) => strip(s, "bodyWeightKg")),
    settings: current.settings.map((s) => strip(s, "bodyWeightKg")),
  };
  await restoreBackup(asV1, "replace");
  check(
    "v1 백업을 복원해도 풀업은 맨몸 운동으로 살아난다",
    (await listExercises()).find((e) => e.name === "풀업")?.usesBodyWeight === true,
  );
  check(
    "v1 세트는 몸무게 없음으로 채워진다",
    (await loadSession(bwSession))!.items[0].sets[0].bodyWeightKg === null,
  );

  console.log("\n[12] v1 → v2 DB 마이그레이션");
  const legacyName = "workout-log-legacy";
  const legacy = new Dexie(legacyName);
  // v1 시절 스키마 그대로. 여기가 실제 폰에 깔려 있는 DB 의 모습이다.
  legacy.version(1).stores({
    exercises: "id, name, bodyPart, deletedAt, updatedAt, [deletedAt+bodyPart]",
    sessions: "id, date, deletedAt, updatedAt, [deletedAt+date], [deletedAt+endedAt]",
    sessionExercises:
      "id, sessionId, deletedAt, updatedAt, [sessionId+deletedAt], [sessionId+order]",
    setLogs:
      "id, sessionExerciseId, exerciseId, deletedAt, updatedAt, [sessionExerciseId+deletedAt], [sessionExerciseId+order], [exerciseId+completedAt]",
    settings: "id",
    restTimer: "id",
  });
  await legacy.open();
  await legacy.table("exercises").add({
    id: "x1",
    name: "풀업",
    bodyPart: "back",
    isCustom: false,
    defaultRestSec: 150,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: 0,
  });
  await legacy.table("setLogs").add({
    id: "s1",
    sessionExerciseId: "se1",
    exerciseId: "x1",
    order: 0,
    weightKg: null,
    reps: 10,
    rpe: null,
    restSec: null,
    completedAt: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: 0,
  });
  await legacy.table("settings").add({
    id: "app",
    defaultRestSec: 90,
    soundEnabled: true,
    vibrationEnabled: true,
    notificationEnabled: false,
    wakeLockEnabled: true,
  });
  legacy.close();

  const migrated = new WorkoutDB(legacyName);
  await migrated.open();
  check(
    "v1 종목에 맨몸 플래그가 채워진다",
    (await migrated.exercises.get("x1"))?.usesBodyWeight === true,
  );
  check(
    "v1 세트의 몸무게는 null 로 채워진다",
    (await migrated.setLogs.get("s1"))?.bodyWeightKg === null,
  );
  check(
    "v1 설정의 몸무게는 null 로 채워진다",
    (await migrated.settings.get("app"))?.bodyWeightKg === null,
  );
  migrated.close();

  Date.now = realNow;

  console.log(
    `\n${failures.length === 0 ? "PASS" : "FAIL"} — ${passed}개 통과, ${failures.length}개 실패`,
  );
  if (failures.length > 0) {
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
