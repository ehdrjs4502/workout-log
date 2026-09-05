"use client";

import { useEffect } from "react";

/**
 * 서비스워커 등록.
 * secure context 가 아니면 (예: 폰에서 http://192.168.x.x 접속) 조용히 넘어간다.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록 실패해도 앱 자체는 정상 동작한다 (오프라인만 안 될 뿐)
    });
  }, []);

  return null;
}
