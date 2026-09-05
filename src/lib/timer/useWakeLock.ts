"use client";

import { useEffect } from "react";

/**
 * 운동 중 화면이 꺼지지 않게 유지한다.
 * 헬스장에서 폰을 거치해두고 쓰는 경우, 알림보다 이게 훨씬 확실하다.
 * 화면이 실제로 꺼졌다 켜지면 락이 자동 해제되므로 visibilitychange 에서 재요청해야 한다.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // 배터리 절약 모드 등에서 거부될 수 있다 — 조용히 포기
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
