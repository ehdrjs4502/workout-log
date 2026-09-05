"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  finalizeRestTimer,
  getRestTimer,
  getSettings,
  markRestTimerNotified,
  setRestTimer,
} from "@/lib/db/repo";
import { notify, playBeep, vibrate } from "./alert";
import { useNow } from "./useNow";

/**
 * 휴식 타이머.
 *
 * 핵심: 카운트다운을 setInterval 로 "세지" 않는다.
 * 저장하는 값은 startedAt / targetSec 두 개뿐이고 남은 시간은 매번 Date.now() 로 역산한다.
 * 화면 갱신용 틱이 백그라운드에서 스로틀링되어도 복귀 시점의 계산 결과는 정확하고,
 * IndexedDB 에 저장하므로 앱을 완전히 껐다 켜도 이어진다.
 */
export function useRestTimer() {
  const timer = useLiveQuery(() => getRestTimer(), []);
  const settings = useLiveQuery(() => getSettings(), []);
  const now = useNow(250, !!timer);

  const elapsedSec = timer && now ? Math.floor((now - timer.startedAt) / 1000) : 0;
  const remainingSec = timer ? timer.targetSec - elapsedSec : 0;
  const isDone = !!timer && now > 0 && remainingSec <= 0;

  // 알림 발사. 중복 방지를 위해 notified 플래그를 DB 에 남긴다.
  useEffect(() => {
    if (!timer || timer.notified || !isDone || !settings) return;
    void markRestTimerNotified();

    if (settings.soundEnabled) playBeep();
    if (settings.vibrationEnabled) vibrate();
    if (settings.notificationEnabled) {
      void notify("휴식 끝", "다음 세트 시작하세요");
    }
  }, [timer, isDone, settings]);

  return {
    timer,
    /** 목표 시간 초과분 포함, 실제로 쉰 시간 */
    elapsedSec,
    /** 음수면 목표를 넘긴 것 */
    remainingSec,
    isDone,
    /** 사용자가 타이머를 직접 늘리거나 줄일 때 */
    addSeconds: async (delta: number) => {
      if (!timer) return;
      await setRestTimer({
        ...timer,
        targetSec: Math.max(15, timer.targetSec + delta),
        notified: false,
      });
    },
    /** 휴식을 여기서 끝냄 — 흐른 시간은 직전 세트에 기록된다 */
    skip: () => finalizeRestTimer(),
  };
}
