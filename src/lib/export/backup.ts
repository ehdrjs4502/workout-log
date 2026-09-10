import { db } from "@/lib/db";
import { inferEquipment, isPresetBodyWeight } from "@/lib/db/presets";
import type {
  Exercise,
  Session,
  SessionExercise,
  SetLog,
  Settings,
} from "@/lib/db/schema";

export const BACKUP_VERSION = 3;

export type Backup = {
  version: number;
  exportedAt: string;
  exercises: Exercise[];
  sessions: Session[];
  sessionExercises: SessionExercise[];
  setLogs: SetLog[];
  settings: Settings[];
};

export async function createBackup(): Promise<Backup> {
  const [exercises, sessions, sessionExercises, setLogs, settings] =
    await Promise.all([
      db.exercises.toArray(),
      db.sessions.toArray(),
      db.sessionExercises.toArray(),
      db.setLogs.toArray(),
      db.settings.toArray(),
    ]);

  // soft delete 된 것도 그대로 담는다 — 복원 후에도 삭제 상태가 유지되어야 한다
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exercises,
    sessions,
    sessionExercises,
    setLogs,
    settings,
  };
}

export function backupFilename() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `workout-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

export type ImportResult = {
  added: number;
  updated: number;
  skipped: number;
};

/** v1 에는 맨몸 운동 관련 필드가 아예 없었다 */
type V1Backup = Omit<V2Backup, "version" | "exercises" | "setLogs" | "settings"> & {
  version: 1;
  exercises: Omit<Exercise, "usesBodyWeight" | "equipment">[];
  setLogs: Omit<SetLog, "bodyWeightKg">[];
  settings: Omit<Settings, "bodyWeightKg">[];
};

/** v2 에는 기구 종류가 없었다 */
type V2Backup = Omit<Backup, "version" | "exercises"> & {
  version: 2;
  exercises: Omit<Exercise, "equipment">[];
};

function v1ToV2(v1: V1Backup): V2Backup {
  return {
    ...v1,
    version: 2,
    // 이름으로 프리셋 맨몸 종목을 알아본다. 나머지는 사용자가 종목 화면에서 켜면 된다.
    exercises: v1.exercises.map((e) => ({
      ...e,
      usesBodyWeight: isPresetBodyWeight(e.name),
    })),
    // 그때는 몸무게를 안 받았으니 소급 적용하지 않는다 (없던 사실을 지어내지 않는다)
    setLogs: v1.setLogs.map((s) => ({ ...s, bodyWeightKg: null })),
    settings: v1.settings.map((s) => ({ ...s, bodyWeightKg: null })),
  };
}

function v2ToV3(v2: V2Backup): Backup {
  return {
    ...v2,
    version: 3,
    exercises: v2.exercises.map((e) => ({ ...e, equipment: inferEquipment(e.name) })),
  };
}

/**
 * 예전 백업 파일도 계속 읽을 수 있어야 한다.
 * 폰에 받아둔 파일이 앱 업데이트 한 번에 "지원하지 않는 버전" 이 되면 그게 곧 기록 유실이다.
 *
 * 한 단계씩 밟아 올린다. v1 파일이 v2 를 건너뛰고 v3 로 점프하면
 * 버전이 하나 늘 때마다 분기가 배로 늘어난다.
 */
function normalizeBackup(backup: Backup): Backup {
  let data: V1Backup | V2Backup | Backup = backup;

  if (data.version === 1) data = v1ToV2(data as V1Backup);
  if (data.version === 2) data = v2ToV3(data as V2Backup);

  if (data.version !== BACKUP_VERSION) {
    throw new Error(
      `지원하지 않는 백업 버전입니다 (파일: ${backup.version}, 앱: ${BACKUP_VERSION})`,
    );
  }
  return data as Backup;
}

/**
 * 백업 병합. 같은 id 는 updatedAt 이 큰 쪽이 이긴다(LWW).
 * 2단계에서 서버 동기화를 붙일 때 쓸 충돌 해결 규칙과 동일하다.
 */
export async function restoreBackup(
  backup: Backup,
  mode: "merge" | "replace",
): Promise<ImportResult> {
  const data = normalizeBackup(backup);

  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };

  await db.transaction(
    "rw",
    [db.exercises, db.sessions, db.sessionExercises, db.setLogs, db.settings],
    async () => {
      if (mode === "replace") {
        await Promise.all([
          db.exercises.clear(),
          db.sessions.clear(),
          db.sessionExercises.clear(),
          db.setLogs.clear(),
          db.settings.clear(),
        ]);
      }

      const merge = async <T extends { id: string; updatedAt: number }>(
        table: {
          get: (id: string) => Promise<T | undefined>;
          put: (row: T) => Promise<unknown>;
        },
        rows: T[],
      ) => {
        for (const row of rows) {
          const existing = await table.get(row.id);
          if (!existing) {
            await table.put(row);
            result.added++;
          } else if (row.updatedAt > existing.updatedAt) {
            await table.put(row);
            result.updated++;
          } else {
            result.skipped++;
          }
        }
      };

      await merge(db.exercises, data.exercises);
      await merge(db.sessions, data.sessions);
      await merge(db.sessionExercises, data.sessionExercises);
      await merge(db.setLogs, data.setLogs);

      for (const s of data.settings) await db.settings.put(s);
    },
  );

  return result;
}

export function parseBackup(json: string): Backup {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    !("setLogs" in parsed)
  ) {
    throw new Error("운동 기록 백업 파일이 아닙니다.");
  }
  return parsed as Backup;
}
