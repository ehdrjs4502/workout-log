"use client";

import { formatClock } from "@/lib/format/date";
import { useNow } from "@/lib/timer/useNow";

/** 세션 경과 시간. endedAt 이 0 이면 계속 흐른다. */
export function ElapsedClock({
  startedAt,
  endedAt,
}: {
  startedAt: number;
  endedAt: number;
}) {
  const running = endedAt === 0;
  const now = useNow(1000, running);
  // now 가 0 인 동안(서버 렌더 / 첫 렌더)은 0:00 으로 시작해 하이드레이션 불일치를 피한다
  const until = running ? now || startedAt : endedAt;

  return (
    <span className="tabular-nums">{formatClock((until - startedAt) / 1000)}</span>
  );
}
