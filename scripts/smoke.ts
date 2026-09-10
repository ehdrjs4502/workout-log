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
  listDatedSets,
  listExercises,
  listSessionsBetween,
  loadSession,
  startSession,
  updateSettings,
} from "@/lib/db/repo";
import { completeSet } from "@/lib/session/actions";
import { createBackup, restoreBackup, type Backup } from "@/lib/export/backup";
import { sessionsToText } from "@/lib/export/toText";
import { sessionVolume, sumVolume } from "@/lib/stats/volume";
import { exerciseTrend, type TrendPoint } from "@/lib/stats/history";
import { CHART, PLOT_H, hitBands, scaleOf, xPositions } from "@/lib/stats/chartScale";
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
  check(
    "프리셋에 기구가 배정된다",
    exercises.find((e) => e.name === "벤치프레스")?.equipment === "barbell" &&
      exercises.find((e) => e.name === "덤벨컬")?.equipment === "dumbbell" &&
      exercises.find((e) => e.name === "랫풀다운")?.equipment === "machine",
  );

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
  check(
    "간단 모드에 세트가 들어간다",
    simple.includes("벤치프레스 (바벨) 60kgx10, 60kgx9, 55kgx8"),
    simple,
  );
  check("상세 모드 제목에도 기구가 붙는다", detailed.includes("### 벤치프레스 (바벨)"), detailed);
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
  check(
    "'기타' 기구는 이름에 붙이지 않는다",
    bwText.includes("### 풀업\n") && !bwText.includes("풀업 (기타)"),
    bwText,
  );

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
    exercises: current.exercises.map((e) =>
      strip(strip(e, "usesBodyWeight"), "equipment"),
    ),
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
  check(
    "v1 백업이 v2 를 건너뛰지 않고 기구까지 채워진다",
    (await listExercises()).find((e) => e.name === "덤벨컬")?.equipment === "dumbbell",
  );

  // v2 = 기구만 없던 버전
  const asV2: Backup = {
    ...current,
    version: 2,
    exercises: current.exercises.map((e) => strip(e, "equipment")),
  };
  await restoreBackup(asV2, "replace");
  check(
    "v2 백업의 종목에 기구가 채워진다",
    (await listExercises()).find((e) => e.name === "랫풀다운")?.equipment === "machine",
  );

  console.log("\n[12] v1 → v3 DB 마이그레이션");
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
  check(
    "v1 DB 가 v3 까지 연달아 올라가 기구도 채워진다",
    (await migrated.exercises.get("x1"))?.equipment === "etc",
  );
  migrated.close();

  console.log("\n[13] 통계 집계");
  // 날짜를 명시해 과거 세션을 만든다. 시계는 오늘에 고정돼 있으므로 completedAt 은
  // 전부 오늘이 되는데, 그런데도 통계가 session.date 를 따라야 한다는 게 요점이다.
  const squat = (await listExercises()).find((e) => e.name === "스쿼트")!;

  const logDay = async (date: string, weights: [number, number][]) => {
    const id = await startSession(date);
    const se = await addExerciseToSession(id, squat.id);
    for (const [weightKg, reps] of weights) {
      await completeSet({
        sessionId: id,
        sessionExerciseId: se,
        exerciseId: squat.id,
        weightKg,
        reps,
        rpe: null,
        usesBodyWeight: false,
        restTargetSec: 180,
      });
      advance(180);
    }
    await endSession(id);
  };

  await logDay("2024-05-01", [
    [100, 5],
    [100, 5],
  ]);
  await logDay("2024-05-08", [
    [110, 5],
    [110, 5],
  ]);

  const dated = await listDatedSets("2024-05-01", "2024-05-08");
  const squatSets = dated.filter((s) => s.exerciseId === squat.id);
  check("범위 안의 세트를 모두 집어온다", squatSets.length === 4, squatSets.length);
  check(
    "세트의 날짜는 completedAt 이 아니라 세션 날짜다",
    squatSets.every((s) => s.date === "2024-05-01" || s.date === "2024-05-08") &&
      squatSets.every((s) => new Date(s.completedAt).getFullYear() !== 2024),
  );

  const trend = exerciseTrend(dated, squat.id, "day");
  check("날짜 오름차순 두 점으로 묶인다", trend.length === 2 && trend[0].date === "2024-05-01", trend.map((t) => t.date));
  check(
    "볼륨은 sumVolume 과 같다",
    trend[0].volume === sumVolume(squatSets.filter((s) => s.date === "2024-05-01")) &&
      trend[0].volume === 1000,
    trend[0].volume,
  );
  check("횟수는 그날 합계다", trend[0].reps === 10 && trend[1].reps === 10, [
    trend[0].reps,
    trend[1].reps,
  ]);
  check("볼륨이 오른 게 그래프에도 그대로 보인다", trend[1].volume === 1100, trend[1].volume);
  check("최고 중량은 기록표용으로 따로 남는다", trend[1].maxWeightKg === 110, trend[1].maxWeightKg);

  const weekly = exerciseTrend(dated, squat.id, "week");
  check(
    "주 단위로 묶으면 다른 주는 그대로 두 점",
    weekly.length === 2,
    weekly.map((w) => w.date),
  );

  const narrow = await listDatedSets("2024-05-02", "2024-05-08");
  check(
    "범위 밖 날짜는 빠진다",
    narrow.filter((s) => s.exerciseId === squat.id).length === 2,
  );

  console.log("\n[14] 그래프 좌표");
  const point = (date: string, volume: number, reps: number): TrendPoint => ({
    date,
    volume,
    reps,
    setCount: 1,
    maxWeightKg: 0,
  });
  const inX = (x: number) =>
    Number.isFinite(x) && x >= CHART.pad.l - 0.01 && x <= CHART.w - CHART.pad.r + 0.01;
  const inY = (y: number) =>
    Number.isFinite(y) && y >= CHART.pad.t - 0.01 && y <= CHART.pad.t + PLOT_H + 0.01;

  const spread = [point("2024-05-01", 1000, 10), point("2024-05-08", 1100, 12), point("2024-06-20", 1400, 9)];
  const spreadX = xPositions(spread);
  check("좌표가 플롯 안에 들어온다", spreadX.every(inX), spreadX);
  check(
    "쉰 기간만큼 x 간격이 벌어진다",
    spreadX[1] - spreadX[0] < spreadX[2] - spreadX[1],
    spreadX,
  );

  const spreadY = spread.map((p) => scaleOf(spread.map((q) => q.volume)).y(p.volume));
  check("y 도 플롯 안에 들어온다", spreadY.every(inY), spreadY);
  check("볼륨이 클수록 위로 간다", spreadY[0] > spreadY[2], spreadY);

  // 값이 전부 같은 경우 — 폭이 0 이라 나눗셈이 터지기 쉬운 자리
  const flat = [point("2024-05-01", 500, 5), point("2024-05-08", 500, 5)];
  const flatScale = scaleOf(flat.map((p) => p.volume));
  check(
    "값이 전부 같아도 NaN 없이 수평선이 된다",
    flat.every((p) => inY(flatScale.y(p.volume))) &&
      flatScale.y(500) === flatScale.y(500),
    flatScale.y(500),
  );

  // 점이 하나뿐인 경우
  const single = [point("2024-05-01", 700, 7)];
  const singleX = xPositions(single);
  check("점 하나면 가운데에 놓인다", singleX.length === 1 && inX(singleX[0]), singleX);
  check(
    "점 하나여도 y 가 멀쩡하다",
    inY(scaleOf(single.map((p) => p.volume)).y(700)),
  );

  const bands = hitBands(spreadX);
  check(
    "터치 영역이 겹치지 않고 이어진다",
    bands.every(([from, to]) => to > from) &&
      bands[0][1] === bands[1][0] &&
      bands[1][1] === bands[2][0],
    bands,
  );
  check(
    "터치 영역이 양 끝까지 닿는다",
    bands[0][0] === CHART.pad.l && bands[2][1] === CHART.w - CHART.pad.r,
    [bands[0][0], bands[2][1]],
  );

  check("빈 배열에도 터지지 않는다", xPositions([]).length === 0 && scaleOf([]).ticks.length === 0);

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
