import type { BodyPart, Equipment } from "./schema";

/**
 * [이름, 기본 휴식(초), 기구, 맨몸 운동?] — 복합관절은 길게, 고립운동은 짧게.
 *
 * 4번째 값이 true 면 볼륨 계산에 몸무게가 더해진다. 풀업/딥스/푸시업처럼
 * 몸 전체를 들어올리는 종목만 켜뒀다 (푸시업은 실제로는 체중의 60~70% 라
 * 다소 후하게 잡히는 근사치다). 종목별로 언제든 끌 수 있다.
 *
 * 기구는 생략할 수 없게 3번째 자리에 뒀다. 맨몸 종목은 'etc' 이고,
 * 맨몸 여부는 4번째 플래그가 따로 말한다 (같은 사실을 두 번 적지 않는다).
 */
export const PRESET_EXERCISES: Record<
  BodyPart,
  [name: string, restSec: number, equipment: Equipment, usesBodyWeight?: boolean][]
> = {
  chest: [
    ["벤치프레스", 180, "barbell"],
    ["인클라인 벤치프레스", 180, "barbell"],
    ["덤벨 벤치프레스", 150, "dumbbell"],
    ["인클라인 덤벨프레스", 150, "dumbbell"],
    ["체스트 프레스 머신", 120, "machine"],
    ["케이블 플라이", 90, "cable"],
    ["딥스", 120, "etc", true],
    ["푸시업", 90, "etc", true],
  ],
  back: [
    ["데드리프트", 210, "barbell"],
    ["랫풀다운", 120, "machine"],
    ["바벨로우", 150, "barbell"],
    ["덤벨로우", 120, "dumbbell"],
    ["시티드 케이블로우", 120, "cable"],
    ["풀업", 150, "etc", true],
    ["티바로우", 150, "barbell"],
    ["페이스풀", 90, "cable"],
  ],
  legs: [
    ["스쿼트", 210, "barbell"],
    ["레그프레스", 150, "machine"],
    ["루마니안 데드리프트", 180, "barbell"],
    ["런지", 120, "dumbbell"],
    ["레그 익스텐션", 90, "machine"],
    ["레그 컬", 90, "machine"],
    ["힙 쓰러스트", 150, "barbell"],
    ["카프 레이즈", 60, "machine"],
  ],
  shoulders: [
    ["오버헤드 프레스", 180, "barbell"],
    ["덤벨 숄더프레스", 150, "dumbbell"],
    ["아놀드 프레스", 120, "dumbbell"],
    ["사이드 레터럴 레이즈", 60, "dumbbell"],
    ["프론트 레이즈", 60, "dumbbell"],
    ["리어 델트 플라이", 60, "dumbbell"],
    ["업라이트 로우", 90, "barbell"],
  ],
  arms: [
    ["바벨컬", 90, "barbell"],
    ["덤벨컬", 90, "dumbbell"],
    ["해머컬", 90, "dumbbell"],
    ["프리처컬", 90, "barbell"],
    ["케이블 푸시다운", 90, "cable"],
    ["라잉 트라이셉 익스텐션", 90, "barbell"],
    ["오버헤드 트라이셉 익스텐션", 90, "dumbbell"],
  ],
  core: [
    ["플랭크", 60, "etc"],
    ["크런치", 60, "etc"],
    ["행잉 레그레이즈", 90, "etc"],
    ["러시안 트위스트", 60, "etc"],
    ["앱 롤아웃", 90, "etc"],
    ["케이블 크런치", 90, "cable"],
  ],
};

const PRESET_ROWS = Object.values(PRESET_EXERCISES).flat();

const BODY_WEIGHT_NAMES = new Set(
  PRESET_ROWS.filter(([, , , bw]) => bw).map(([name]) => name),
);

/**
 * 프리셋 이름 기준 맨몸 운동 여부.
 * usesBodyWeight 가 없던 시절(v1)의 데이터를 백필할 때 쓴다.
 */
export const isPresetBodyWeight = (name: string) => BODY_WEIGHT_NAMES.has(name);

const PRESET_EQUIPMENT = new Map<string, Equipment>(
  PRESET_ROWS.map(([name, , equipment]) => [name, equipment]),
);

/**
 * 이름으로 기구를 되짚는다. equipment 가 없던 시절(v2)의 데이터를 백필할 때 쓴다.
 * 프리셋에 없는 사용자 종목은 이름에 박힌 단서로 추측하고, 그래도 모르면 '기타'.
 * 어차피 종목 화면에서 언제든 고칠 수 있으니 억지로 맞히려 들지 않는다.
 */
export function inferEquipment(name: string): Equipment {
  const preset = PRESET_EQUIPMENT.get(name);
  if (preset) return preset;
  if (name.includes("덤벨")) return "dumbbell";
  if (name.includes("바벨")) return "barbell";
  if (name.includes("머신")) return "machine";
  if (name.includes("케이블")) return "cable";
  return "etc";
}
