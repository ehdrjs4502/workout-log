import Dexie, { type Table } from "dexie";
import {
  ALIVE,
  DEFAULT_SETTINGS,
  type Exercise,
  type RestTimerState,
  type Session,
  type SessionExercise,
  type SetLog,
  type Settings,
  type BodyPart,
} from "./schema";
import { inferEquipment, isPresetBodyWeight, PRESET_EXERCISES } from "./presets";

/**
 * crypto.randomUUID() 는 secure context 전용이라
 * 폰에서 http://192.168.x.x 로 열면 undefined 다. 폴백을 둔다.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowMeta() {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, deletedAt: ALIVE };
}

class WorkoutDB extends Dexie {
  exercises!: Table<Exercise, string>;
  sessions!: Table<Session, string>;
  sessionExercises!: Table<SessionExercise, string>;
  setLogs!: Table<SetLog, string>;
  settings!: Table<Settings, string>;
  restTimer!: Table<RestTimerState, string>;

  /** 이름을 받는 건 마이그레이션 테스트에서 별도 DB 를 열기 위해서다 */
  constructor(name = "workout-log") {
    super(name);
    this.version(1).stores({
      exercises: "id, name, bodyPart, deletedAt, updatedAt, [deletedAt+bodyPart]",
      sessions: "id, date, deletedAt, updatedAt, [deletedAt+date], [deletedAt+endedAt]",
      sessionExercises:
        "id, sessionId, deletedAt, updatedAt, [sessionId+deletedAt], [sessionId+order]",
      setLogs:
        "id, sessionExerciseId, exerciseId, deletedAt, updatedAt, [sessionExerciseId+deletedAt], [sessionExerciseId+order], [exerciseId+completedAt]",
      settings: "id",
      restTimer: "id",
    });

    // v2: 맨몸 운동 볼륨용 필드 추가.
    // 인덱스는 그대로라 stores 는 비워두고(= 변경 없음) 값만 채운다.
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<Exercise>("exercises")
          .toCollection()
          .modify((row) => {
            row.usesBodyWeight = isPresetBodyWeight(row.name);
          });
        await tx
          .table<SetLog>("setLogs")
          .toCollection()
          .modify((row) => {
            row.bodyWeightKg = null;
          });
        await tx
          .table<Settings>("settings")
          .toCollection()
          .modify((row) => {
            row.bodyWeightKg = null;
          });
      });

    // v3: 기구 종류 추가. 인덱스는 그대로고(종목은 수십 개뿐이라 메모리 필터로 충분),
    // 값은 이름으로 되짚어 채운다.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table<Exercise>("exercises")
          .toCollection()
          .modify((row) => {
            row.equipment = inferEquipment(row.name);
          });
      });

    this.on("populate", () => seed(this));
  }
}

function seed(db: WorkoutDB) {
  const now = Date.now();
  const rows: Exercise[] = [];
  for (const [part, list] of Object.entries(PRESET_EXERCISES)) {
    for (const [name, rest, equipment, usesBodyWeight] of list) {
      rows.push({
        id: newId(),
        name,
        bodyPart: part as BodyPart,
        equipment,
        isCustom: false,
        defaultRestSec: rest,
        usesBodyWeight: usesBodyWeight ?? false,
        createdAt: now,
        updatedAt: now,
        deletedAt: ALIVE,
      });
    }
  }
  db.exercises.bulkAdd(rows);
  db.settings.add({ ...DEFAULT_SETTINGS });
}

export const db = new WorkoutDB();
export { WorkoutDB };
