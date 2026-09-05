"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * 흐르는 현재 시각.
 *
 * "시계"라는 외부 시스템을 구독하는 형태라 useSyncExternalStore 가 정확히 들어맞는다.
 * setInterval 은 화면을 다시 그리기 위한 것일 뿐, 시간의 출처는 언제나 Date.now() 다.
 * visibilitychange 에서도 갱신하므로 백그라운드에서 스로틀링되어도
 * 돌아온 순간 정확한 값으로 맞춰진다.
 *
 * @returns epoch ms. 서버 렌더와 첫 렌더에서는 0.
 */
export function useNow(intervalMs: number, active: boolean): number {
  const nowRef = useRef(0);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!active) return () => {};

      const tick = () => {
        nowRef.current = Date.now();
        onStoreChange();
      };
      tick();

      const id = window.setInterval(tick, intervalMs);
      document.addEventListener("visibilitychange", tick);
      return () => {
        window.clearInterval(id);
        document.removeEventListener("visibilitychange", tick);
      };
    },
    [intervalMs, active],
  );

  return useSyncExternalStore(
    subscribe,
    () => nowRef.current,
    () => 0,
  );
}
