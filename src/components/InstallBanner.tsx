"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { Button } from "./ui";
import { useIsClient } from "@/lib/hooks/useIsClient";

const DISMISS_KEY = "install-banner-dismissed";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * 단순 안내가 아니라 데이터 보존 수단이다.
 * iOS Safari 는 홈 화면에 설치되지 않은 사이트의 IndexedDB 를
 * 7일 미사용 시 삭제한다 — 설치해야 운동 기록이 살아남는다.
 */
export function InstallBanner() {
  const isClient = useIsClient();
  const [dismissed, setDismissed] = useState(false);
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!isClient || dismissed) return null;
  if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return null;

  const iOS = isIOSDevice();

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="relative rounded-2xl border border-accent/30 bg-accent/10 p-4 pr-10">
      <button
        type="button"
        aria-label="닫기"
        onClick={dismiss}
        className="absolute right-2 top-2 p-2 text-muted"
      >
        <X size={16} />
      </button>
      <p className="text-sm font-medium">홈 화면에 추가해 주세요</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {iOS
          ? "iOS는 설치하지 않은 사이트의 저장 데이터를 7일 미사용 시 삭제합니다. 공유 버튼 → 홈 화면에 추가 를 눌러 설치하면 기록이 안전하게 남습니다."
          : "설치하면 오프라인에서도 열리고, 휴식 알림을 받을 수 있습니다."}
      </p>
      {iOS ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-accent">
          <Share size={14} /> 공유 → 홈 화면에 추가
        </p>
      ) : deferred ? (
        <Button
          size="sm"
          variant="primary"
          className="mt-3"
          onClick={async () => {
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            setDeferred(null);
            if (outcome === "accepted") dismiss();
          }}
        >
          설치
        </Button>
      ) : null}
    </div>
  );
}
