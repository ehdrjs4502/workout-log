import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

/** 로컬 기준 'YYYY-MM-DD'. UTC 로 밀리면 새벽 운동이 전날로 기록되므로 반드시 로컬. */
export const toDateKey = (d: Date) => format(d, "yyyy-MM-dd");
export const todayKey = () => toDateKey(new Date());

/** 'YYYY-MM-DD' → Date (로컬 자정) */
export const fromDateKey = (key: string) => parseISO(key);

export const formatDateKo = (key: string) =>
  format(fromDateKey(key), "M월 d일 (E)", { locale: ko });

export const formatDateFullKo = (key: string) =>
  format(fromDateKey(key), "yyyy-MM-dd (E)", { locale: ko });

/** 초 → "1:30" / "12:05" / "1:02:30" */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, "0")}`
    : `${mm}:${String(sec).padStart(2, "0")}`;
}

/** 초 → "90초" / "1분 30초" */
export function formatRest(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/** ms → "68분" / "1시간 8분" */
export function formatDurationMs(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}

/** 60 → "60", 62.5 → "62.5" (불필요한 .0 제거) */
export const formatWeight = (kg: number) =>
  Number.isInteger(kg) ? String(kg) : String(Number(kg.toFixed(2)));

/** epoch ms → "20:15". 알림에 적는 휴식 종료 예정 시각 */
export const formatTimeOfDay = (ms: number) => format(new Date(ms), "HH:mm");
