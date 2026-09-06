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
import {
  clearRestNotification,
  notifyRestDone,
  notifyRestStarted,
  playBeep,
  vibrate,
} from "./alert";
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

  /*
   * 휴식이 시작되거나 목표 시간이 바뀌면 종료 예정 시각을 알림창에 미리 깔아둔다.
   * 화면을 끄면 아래 "휴식 끝" 알림이 못 나갈 수 있어서, 지금 띄워두는 게 유일한 보험이다.
   *
   * deps 를 원시값으로 풀어둔 건 useLiveQuery 가 매번 새 객체를 돌려주기 때문이다.
   * timer 를 그대로 넣으면 관련 쓰기마다 알림이 다시 나간다.
   */
  const notificationEnabled = settings?.notificationEnabled ?? false;
  const restPending = !!timer && !timer.notified;
  const restTargetSec = timer?.targetSec ?? 0;
  const restEndsAt = timer ? timer.startedAt + timer.targetSec * 1000 : 0;

  useEffect(() => {
    if (!restPending || !notificationEnabled) return;
    void notifyRestStarted(restTargetSec, restEndsAt);
  }, [restPending, notificationEnabled, restTargetSec, restEndsAt]);

  // 알림 발사. 중복 방지를 위해 notified 플래그를 DB 에 남긴다.
  useEffect(() => {
    if (!timer || timer.notified || !isDone || !settings) return;
    void markRestTimerNotified();

    if (settings.soundEnabled) playBeep();
    if (settings.vibrationEnabled) vibrate();
    if (settings.notificationEnabled) {
      // 백그라운드에서는 위의 playBeep/vibrate 가 무시되므로 알림에 진동을 실어 보낸다
      void notifyRestDone(settings.vibrationEnabled);
    }
  }, [timer, isDone, settings]);

  /*
   * 타이머가 사라지면(다음 세트 완료 · 휴식 종료 · 운동 종료) 깔아둔 알림도 치운다.
   * null 은 "없음", undefined 는 "아직 로딩 중" — 구분하지 않으면 앱을 열 때마다
   * 진행 중이던 휴식 알림을 지웠다 다시 띄우게 된다.
   */
  const noTimer = timer === null;
  useEffect(() => {
    if (!noTimer) return;
    void clearRestNotification();
  }, [noTimer]);

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
