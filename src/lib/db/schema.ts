export type BodyPart =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core";

export const BODY_PARTS: {
  key: BodyPart;
  label: string;
  /** globals.css 의 --color-{part} 와 짝을 이룬다 */
  color: string;
}[] = [
  { key: "chest", label: "가슴", color: "var(--color-chest)" },
  { key: "back", label: "등", color: "var(--color-back)" },
  { key: "legs", label: "하체", color: "var(--color-legs)" },
  { key: "shoulders", label: "어깨", color: "var(--color-shoulders)" },
  { key: "arms", label: "팔", color: "var(--color-arms)" },
  { key: "core", label: "코어", color: "var(--color-core)" },
];

export const BODY_PART_LABEL = Object.fromEntries(
  BODY_PARTS.map((p) => [p.key, p.label]),
) as Record<BodyPart, string>;

export const BODY_PART_COLOR = Object.fromEntries(
  BODY_PARTS.map((p) => [p.key, p.color]),
) as Record<BodyPart, string>;

/**
 * 기구 종류. 종목이 아니라 '그날 그 종목을 무엇으로 했는가'의 속성이다 — 같은 벤치프레스를
 * 바벨로도 덤벨로도 하니까. 그래서 세션에 종목을 넣을 때 고르고 SessionExercise 에 남긴다.
 *
 * 표시와 입력 단위에만 쓴다 — 볼륨 계산식(stats/volume.ts)은 이 값을 보지 않는다.
 * 그래야 장비를 나중에 고쳐도 지난 기록의 수치가 흔들리지 않는다.
 *
 * 값은 세 가지 중 하나다.
 *  - 프리셋 키 ('barbell' 등)
 *  - NO_EQUIPMENT ('etc') — 기구 없음. 플랭크·풀업처럼 몸만 쓰는 종목.
 *    키 이름이 'etc' 인 건 예전 '기타' 를 그대로 물려받아서다 (마이그레이션 없이 옛 기록이 '없음' 이 된다)
 *  - 그 밖의 문자열 — 사용자가 직접 적은 기구 이름 ('케틀벨', '스미스머신' …). 그대로 보여준다
 *
 * '맨몸' 이 따로 없는 건 usesBodyWeight 가 이미 그 질문("볼륨에 몸무게를 더하나")에 답하기 때문이다.
 * 풀업은 equipment: 'etc' + usesBodyWeight: true 로 표현된다.
 */
export type PresetEquipment = "barbell" | "dumbbell" | "machine" | "cable";

// (string & {}) 는 자동완성에서 프리셋 키가 사라지지 않게 하는 관용구다
export type Equipment = PresetEquipment | typeof NO_EQUIPMENT | (string & {});

export const NO_EQUIPMENT = "etc";

export const PRESET_EQUIPMENTS: {
  key: PresetEquipment;
  label: string;
  /** 무게 Stepper 의 증감폭. 머신·케이블은 웨이트 스택이 보통 5kg 단위다 */
  step: number;
}[] = [
  { key: "barbell", label: "바벨", step: 2.5 },
  { key: "dumbbell", label: "덤벨", step: 2.5 },
  { key: "machine", label: "머신", step: 5 },
  { key: "cable", label: "케이블", step: 5 },
];

const presetOf = (e: Equipment) => PRESET_EQUIPMENTS.find((p) => p.key === e);

export const isCustomEquipment = (e: Equipment) =>
  e !== NO_EQUIPMENT && presetOf(e) === undefined;

export function equipmentLabel(e: Equipment): string {
  if (e === NO_EQUIPMENT) return "없음";
  return presetOf(e)?.label ?? e;
}

/** 직접 적은 기구는 증감폭을 알 수 없으니 가장 흔한 2.5kg 로 둔다 */
export const equipmentStep = (e: Equipment) => presetOf(e)?.step ?? 2.5;

/**
 * 직접 입력을 저장할 값으로 바꾼다. '바벨' 이라고 적으면 프리셋 바벨과 같은 것으로 본다 —
 * 안 그러면 같은 기구가 둘로 갈려 지난 기록을 못 찾는다. 빈 입력은 null.
 */
export function normalizeEquipment(input: string): Equipment | null {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const preset = PRESET_EQUIPMENTS.find((p) => p.label === text || p.key === text);
  if (preset) return preset.key;
  if (text === "없음" || text === NO_EQUIPMENT) return NO_EQUIPMENT;
  return text;
}

/**
 * 모든 레코드가 공유하는 동기화 메타.
 * 2단계에서 서버를 붙일 때 updatedAt 만으로 변경분을 뽑을 수 있도록 처음부터 넣어둔다.
 */
export type SyncMeta = {
  createdAt: number;
  updatedAt: number;
  /** 0 = 살아있음. IndexedDB 는 null 을 인덱싱하지 못하므로 sentinel 을 쓴다 */
  deletedAt: number;
};

export const ALIVE = 0;

export type Exercise = SyncMeta & {
  id: string;
  name: string;
  bodyPart: BodyPart;
  /**
   * 마지막으로 고른 기구. 다음에 이 종목을 세션에 넣을 때 기본 선택값으로만 쓴다.
   * 기록의 정본은 SessionExercise.equipment 다.
   */
  equipment: Equipment;
  /** 사용자가 직접 추가한 종목인지 (프리셋과 구분) */
  isCustom: boolean;
  defaultRestSec: number;
  /** 풀업·딥스처럼 몸 자체를 들어올리는 종목. 볼륨 계산에 몸무게가 더해진다 */
  usesBodyWeight: boolean;
};

export type Session = SyncMeta & {
  id: string;
  /** 'YYYY-MM-DD' 로컬 기준. 캘린더 조회의 인덱스 키 */
  date: string;
  startedAt: number;
  /** 0 = 아직 진행 중. deletedAt 과 같은 이유로 sentinel */
  endedAt: number;
};

export type SessionExercise = SyncMeta & {
  id: string;
  sessionId: string;
  exerciseId: string;
  /** 이번에 이 종목을 무엇으로 했는지. 무게 입력 단위·지난 기록 조회·내보내기에 쓴다 */
  equipment: Equipment;
  order: number;
};

export type SetLog = SyncMeta & {
  id: string;
  sessionExerciseId: string;
  /**
   * sessionExercise.exerciseId 의 비정규화 사본.
   * sessionExercise 생성 후 절대 바뀌지 않으므로 안전하고,
   * "이 종목 지난번 기록" 조회를 join 없이 인덱스 한 방으로 끝낼 수 있다.
   */
  exerciseId: string;
  order: number;
  /** 추가로 매단 중량. null = 맨몸 */
  weightKg: number | null;
  /**
   * 맨몸 종목일 때, 이 세트를 기록한 시점의 몸무게 스냅샷. null = 해당 없음.
   * 설정에서 몸무게를 고쳐도 지난 기록의 볼륨이 흔들리지 않도록 값을 박아둔다.
   */
  bodyWeightKg: number | null;
  reps: number;
  /** 1~10, 0.5 단위. null = 미입력 */
  rpe: number | null;
  /** 이 세트를 마치고 다음 세트까지 쉰 시간(초). 마지막 세트는 null */
  restSec: number | null;
  completedAt: number;
};

export type Settings = {
  /** 항상 'app' 고정 (단일 레코드 테이블) */
  id: string;
  defaultRestSec: number;
  /** 맨몸 종목 볼륨에 쓰는 몸무게. null = 미설정(볼륨에 몸무게를 더하지 않는다) */
  bodyWeightKg: number | null;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  notificationEnabled: boolean;
  wakeLockEnabled: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  id: "app",
  defaultRestSec: 90,
  bodyWeightKg: null,
  soundEnabled: true,
  vibrationEnabled: true,
  notificationEnabled: false,
  wakeLockEnabled: true,
};

/** 진행 중인 휴식 타이머. setInterval 이 아니라 시작 시각만 저장해 복구 가능하게 한다. */
export type RestTimerState = {
  id: string; // 'current' 고정
  sessionId: string;
  /** 직전에 완료한 세트. 다음 세트 완료 시 이 세트의 restSec 을 채운다 */
  setLogId: string;
  startedAt: number;
  targetSec: number;
  /** 알림을 이미 쐈는지 (중복 발사 방지) */
  notified: boolean;
};
