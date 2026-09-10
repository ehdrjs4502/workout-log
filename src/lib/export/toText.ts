import type { HydratedSession, HydratedSessionExercise } from "@/lib/db/repo";
import { EQUIPMENT_LABEL } from "@/lib/db/schema";
import {
  formatClock,
  formatDateFullKo,
  formatDurationMs,
  formatWeight,
} from "@/lib/format/date";
import {
  formatSetWeight,
  sessionBodyWeight,
  sessionVolume,
} from "@/lib/stats/volume";

export type ExportMode = "simple" | "detailed";

/**
 * "랫풀다운 (머신)" — 이름만으로는 뭘로 들었는지 알 수 없는 종목이 많다.
 * 머신이냐 프리웨이트냐에 따라 평가가 갈리니 붙여준다.
 * '기타' 는 알려주는 게 없으므로 적지 않는다 (맨몸 여부는 머리말의 체중이 말한다).
 */
function nameOf(item: HydratedSessionExercise): string {
  const exercise = item.exercise;
  if (!exercise) return "알 수 없는 종목";
  return exercise.equipment === "etc"
    ? exercise.name
    : `${exercise.name} (${EQUIPMENT_LABEL[exercise.equipment]})`;
}

function header(session: HydratedSession) {
  const duration = session.endedAt ? session.endedAt - session.startedAt : 0;
  const bodyWeight = sessionBodyWeight(session);

  const parts = [formatDateFullKo(session.date)];
  if (duration > 0) parts.push(formatDurationMs(duration));
  // 맨몸 세트가 있으면 볼륨의 근거가 되는 몸무게를 같이 적는다.
  // 이 텍스트를 AI 에 붙여넣었을 때 "맨몸 x 10" 만 보면 해석할 수가 없다.
  if (bodyWeight !== null) parts.push(`체중 ${formatWeight(bodyWeight)}kg`);
  return parts.join(" · ");
}

/** AI 에 붙여넣기 좋은 최소 형태 */
function toSimple(session: HydratedSession): string {
  const lines = [header(session)];
  for (const item of session.items) {
    if (item.sets.length === 0) continue;
    const sets = item.sets
      .map((s) => `${formatSetWeight(s)}x${s.reps}`)
      .join(", ");
    lines.push(`${nameOf(item)} ${sets}`);
  }
  return lines.join("\n");
}

/** 휴식 시간 / RPE / 볼륨까지 포함한 형태 */
function toDetailed(session: HydratedSession): string {
  const lines = [`## ${header(session)}`];

  for (const item of session.items) {
    if (item.sets.length === 0) continue;
    lines.push(`### ${nameOf(item)}`);

    item.sets.forEach((set, i) => {
      const parts = [`${i + 1}. ${formatSetWeight(set)} x ${set.reps}`];
      if (set.rpe !== null) parts.push(`RPE ${set.rpe}`);
      if (set.restSec !== null) parts.push(`(휴식 ${formatClock(set.restSec)})`);
      lines.push(parts.join("  "));
    });
  }

  const volume = sessionVolume(session);
  if (volume > 0) {
    lines.push(`총 볼륨 ${Math.round(volume).toLocaleString()}kg`);
  }
  return lines.join("\n");
}

export function sessionToText(session: HydratedSession, mode: ExportMode) {
  return mode === "simple" ? toSimple(session) : toDetailed(session);
}

export function sessionsToText(
  sessions: HydratedSession[],
  mode: ExportMode,
): string {
  const withSets = sessions.filter((s) =>
    s.items.some((i) => i.sets.length > 0),
  );
  if (withSets.length === 0) return "";

  return withSets
    .slice()
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => sessionToText(s, mode))
    .join("\n\n");
}
