"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * 서버 렌더에서는 false, 하이드레이션 이후 true.
 *
 * window/navigator 를 읽어야 하는데 그 값이 서버와 다를 수밖에 없을 때 쓴다.
 * useState + useEffect 로 같은 걸 하면 렌더가 한 번 더 도는 데다
 * React Compiler 가 경고하므로 useSyncExternalStore 로 처리한다.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
