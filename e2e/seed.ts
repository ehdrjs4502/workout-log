import type { Page } from "@playwright/test";

/**
 * 과거 기록 심기.
 *
 * 캘린더·통계·내보내기는 며칠~몇 달치 데이터가 있어야 의미가 있는데, UI 로는 과거 날짜를
 * 만들 수 없다. 서버가 없으니 목킹할 API 도 없다. 그래서 브라우저 안에서 IndexedDB 에
 * 직접 쓴다 — 이 앱에서 '테스트 데이터 준비'는 곧 이 작업이다.
 *
 * 전제: 앱을 한 번 열어서(page.goto) Dexie 가 DB 를 만들고 프리셋 종목을 시딩한 뒤여야 한다.
 * 쓰고 난 뒤에는 반드시 page.goto/reload 로 다시 읽어야 한다.
 * useLiveQuery 는 Dexie 자신의 쓰기만 감지하므로, 생 IndexedDB 커넥션의 변경은 모른다.
 */

export type SeedSet = {
  /** null = 맨몸 */
  weightKg: number | null;
  reps: number;
  rpe?: number | null;
  /** 이 세트를 마치고 다음 세트까지 쉰 초. 마지막 세트는 보통 null */
  restSec?: number | null;
};

export type SeedExercise = {
  /** 프리셋 종목 이름 그대로. 예: '벤치프레스' */
  name: string;
  /** 'barbell' 등. 기본은 그 종목의 프리셋 기구 */
  equipment?: string;
  sets: SeedSet[];
};

export type SeedSession = {
  /** 'YYYY-MM-DD' 로컬 기준 */
  date: string;
  /** 시작 시각(HH:mm). 기본 19:00 */
  startTime?: string;
  /** 운동 시간(분). 기본 60 */
  durationMin?: number;
  exercises: SeedExercise[];
};

export async function seedSessions(page: Page, specs: SeedSession[]) {
  await page.evaluate(async (sessions: SeedSession[]) => {
    const ALIVE = 0;

    const req = <T>(r: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    /**
     * 함정: indexedDB.open(name) 을 버전 없이 부르는데 DB 가 아직 없으면
     * '빈 v1 DB 를 새로 만든다'. 그 뒤에 Dexie 가 열면 oldVersion 이 0 이 아니게 되어
     * populate 훅이 영영 돌지 않고, 프리셋 종목 44개가 통째로 사라진다.
     *
     * 그래서 (1) databases() 로 존재를 먼저 확인하고 (2) 스토어가 다 생길 때까지 기다린다.
     * page.goto 직후에는 아직 React 가 첫 쿼리를 쏘기 전일 수 있어서 이 대기가 꼭 필요하다.
     */
    const openWhenReady = async (): Promise<IDBDatabase> => {
      for (let i = 0; i < 200; i++) {
        const exists = (await indexedDB.databases()).some(
          (d) => d.name === "workout-log",
        );
        if (exists) {
          const handle = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open("workout-log");
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          if (handle.objectStoreNames.contains("exercises")) return handle;
          handle.close(); // 업그레이드 트랜잭션이 아직 안 끝났다
        }
        await sleep(50);
      }
      throw new Error("workout-log DB 가 준비되지 않았습니다. page.goto 후에 호출하세요.");
    };

    const db = await openWhenReady();

    // 프리셋 시딩이 끝날 때까지 기다린다 ('populate' 훅이 비동기다)
    const readExercises = async () => {
      const tx = db.transaction("exercises", "readonly");
      return req(tx.objectStore("exercises").getAll());
    };
    let exercises = await readExercises();
    for (let i = 0; exercises.length === 0 && i < 100; i++) {
      await sleep(50);
      exercises = await readExercises();
    }
    if (exercises.length === 0) {
      throw new Error("프리셋 종목이 아직 시딩되지 않았습니다.");
    }

    type Row = { name: string; id: string; equipment: string };
    const byName = new Map<string, Row>(exercises.map((e: Row) => [e.name, e]));

    const id = () => crypto.randomUUID();
    const meta = (t: number) => ({ createdAt: t, updatedAt: t, deletedAt: ALIVE });

    const tx = db.transaction(
      ["sessions", "sessionExercises", "setLogs"],
      "readwrite",
    );
    const sessionStore = tx.objectStore("sessions");
    const linkStore = tx.objectStore("sessionExercises");
    const setStore = tx.objectStore("setLogs");

    for (const spec of sessions) {
      const [h, m] = (spec.startTime ?? "19:00").split(":").map(Number);
      const [y, mo, d] = spec.date.split("-").map(Number);
      const startedAt = new Date(y, mo - 1, d, h, m).getTime();
      const endedAt = startedAt + (spec.durationMin ?? 60) * 60_000;

      const sessionId = id();
      sessionStore.put({
        id: sessionId,
        date: spec.date,
        startedAt,
        endedAt,
        ...meta(startedAt),
      });

      spec.exercises.forEach((ex, order) => {
        const exercise = byName.get(ex.name);
        if (!exercise) throw new Error(`알 수 없는 종목: ${ex.name}`);
        const exerciseId = exercise.id;

        const linkId = id();
        linkStore.put({
          id: linkId,
          sessionId,
          exerciseId,
          // 기구는 세션 안의 종목에 남는다. 따로 안 주면 프리셋 기본값
          equipment: ex.equipment ?? exercise.equipment,
          order,
          ...meta(startedAt),
        });

        ex.sets.forEach((set, i) => {
          // 세트 간격을 그럴듯하게 벌린다 (통계의 completedAt 인덱스가 쓰인다)
          const completedAt = startedAt + (order * 15 + (i + 1) * 3) * 60_000;
          setStore.put({
            id: id(),
            sessionExerciseId: linkId,
            exerciseId,
            order: i,
            weightKg: set.weightKg,
            bodyWeightKg: null,
            reps: set.reps,
            rpe: set.rpe ?? null,
            restSec: set.restSec ?? null,
            completedAt,
            ...meta(completedAt),
          });
        });
      });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  }, specs);
}

/** 오늘로부터 n일 전의 'YYYY-MM-DD' (로컬 기준) */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
