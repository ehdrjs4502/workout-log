"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록.
 * secure context 가 아니면 (예: 폰에서 http://192.168.x.x 접속) 조용히 넘어간다.
 *
 * 개발 서버에서도 등록은 한다 — 휴식 알림이 서비스워커를 통해서만 뜨는 기기(안드로이드)가 있다.
 * 대신 캐시는 끈다. dev 청크를 캐시하면 코드를 고친 뒤 낡은 청크가 섞여 앱이 깨진다.
 */
const SW_URL = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?cache=off";
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register(SW_URL).catch(() => {
      // 등록 실패해도 앱 자체는 정상 동작한다 (오프라인만 안 될 뿐)
    });
  }, []);

  return null;
}
