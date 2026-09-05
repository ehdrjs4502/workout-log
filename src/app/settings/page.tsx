"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, HardDrive, Upload } from "lucide-react";
import { Button, LoadingBlock, PageHeader, Toggle } from "@/components/ui";
import { Stepper } from "@/components/Stepper";
import { getSettings, updateSettings } from "@/lib/db/repo";
import {
  capabilities,
  playBeep,
  requestNotificationPermission,
  unlockAudio,
  vibrate,
} from "@/lib/timer/alert";
import { useIsClient } from "@/lib/hooks/useIsClient";
import {
  backupFilename,
  createBackup,
  parseBackup,
  restoreBackup,
} from "@/lib/export/backup";

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), []);
  const isClient = useIsClient();
  const [storage, setStorage] = useState<{
    usage: number;
    quota: number;
    persisted: boolean;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 알림 권한을 바꾸면 지원 현황을 다시 읽어야 한다 (강제 리렌더용)
  const [, refreshCaps] = useReducer((n: number) => n + 1, 0);
  const fileRef = useRef<HTMLInputElement>(null);

  // 몇 개의 프로퍼티 읽기라 매 렌더 호출해도 부담이 없다
  const caps = isClient ? capabilities() : null;

  const refreshStorage = useCallback(async () => {
    if (!navigator.storage?.estimate) return;
    const est = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0, persisted });
  }, []);

  useEffect(() => {
    // 저장소 사용량은 마운트 시점에 브라우저에서 비동기로 읽어오는 값이라
    // effect 말고는 가져올 방법이 없다 (setState 는 await 이후에 일어난다).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStorage();
  }, [refreshStorage]);

  if (!settings || !caps) {
    return (
      <>
        <PageHeader title="설정" />
        <LoadingBlock />
      </>
    );
  }

  const onToggleNotification = async (next: boolean) => {
    if (next) {
      const permission = await requestNotificationPermission();
      refreshCaps();
      if (permission !== "granted") {
        alert(
          "브라우저에서 알림이 차단되어 있습니다.\niOS는 홈 화면에 설치된 상태에서만 알림을 받을 수 있습니다.",
        );
        return;
      }
    }
    await updateSettings({ notificationEnabled: next });
  };

  const onExport = async () => {
    setBusy("export");
    try {
      const json = JSON.stringify(await createBackup(), null, 2);
      const filename = backupFilename();
      const file = new File([json], filename, { type: "application/json" });

      // iOS 는 다운로드가 어색해서, 가능하면 공유 시트로 넘긴다
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }

      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        alert(`내보내기에 실패했습니다: ${(e as Error).message}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const onImport = async (file: File) => {
    setBusy("import");
    try {
      const backup = parseBackup(await file.text());
      const mode = confirm(
        "기존 기록에 합칠까요?\n\n확인 = 합치기 (같은 기록은 최신 것으로)\n취소 = 전체 교체 (지금 기기의 기록을 모두 지웁니다)",
      )
        ? "merge"
        : "replace";

      if (
        mode === "replace" &&
        !confirm("정말 지금 기기의 모든 기록을 지우고 파일 내용으로 교체할까요?")
      ) {
        return;
      }

      const result = await restoreBackup(backup, mode);
      alert(
        `가져오기 완료\n새로 추가 ${result.added}건 · 갱신 ${result.updated}건 · 건너뜀 ${result.skipped}건`,
      );
      await refreshStorage();
    } catch (e) {
      alert(`가져오기에 실패했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <PageHeader title="설정" />

      <main className="flex-1 space-y-6 p-4">
        {!caps.secureContext ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-danger">
            보안 연결(HTTPS)이 아닙니다. 알림·화면 켜두기·클립보드가 동작하지
            않습니다. 폰에서는 배포된 https 주소로 접속하세요.
          </p>
        ) : null}

        <Section title="휴식 알림">
          <Toggle
            label="소리"
            note={caps.sound ? undefined : "이 브라우저에서 지원하지 않음"}
            disabled={!caps.sound}
            checked={settings.soundEnabled}
            onChange={(v) => updateSettings({ soundEnabled: v })}
          />
          <Toggle
            label="진동"
            note={caps.vibration ? undefined : "이 기기에서 지원하지 않음 (iOS 미지원)"}
            disabled={!caps.vibration}
            checked={settings.vibrationEnabled}
            onChange={(v) => updateSettings({ vibrationEnabled: v })}
          />
          <Toggle
            label="알림"
            note={
              !caps.notification
                ? "이 브라우저에서 지원하지 않음"
                : caps.standalone
                  ? undefined
                  : "iOS는 홈 화면에 설치해야 동작합니다"
            }
            disabled={!caps.notification}
            checked={settings.notificationEnabled}
            onChange={onToggleNotification}
          />
          <Toggle
            label="운동 중 화면 켜두기"
            note={caps.wakeLock ? undefined : "이 브라우저에서 지원하지 않음"}
            disabled={!caps.wakeLock}
            checked={settings.wakeLockEnabled}
            onChange={(v) => updateSettings({ wakeLockEnabled: v })}
          />
          <button
            type="button"
            onClick={() => {
              // 소리 테스트도 제스처 안에서 unlock 이 먼저다
              unlockAudio();
              if (settings.soundEnabled) window.setTimeout(playBeep, 60);
              if (settings.vibrationEnabled) vibrate();
            }}
            className="mt-1 w-full rounded-xl border border-border py-3 text-sm text-muted active:bg-surface"
          >
            알림 테스트
          </button>
        </Section>

        <Section title="기본값">
          <Stepper
            label="새 종목의 기본 휴식 시간 (초)"
            value={settings.defaultRestSec}
            onChange={(v) => updateSettings({ defaultRestSec: v })}
            step={15}
            min={15}
            max={600}
          />
          <Stepper
            label="내 몸무게 (kg)"
            value={settings.bodyWeightKg ?? 0}
            onChange={(v) => updateSettings({ bodyWeightKg: v === 0 ? null : v })}
            step={0.5}
            min={0}
            max={250}
            zeroLabel="미설정"
            decimal
          />
          <p className="px-1 text-xs leading-relaxed text-muted">
            풀업·딥스처럼 맨몸으로 하는 종목의 볼륨에 더해집니다. 세트를 기록하는
            순간의 값이 그 세트에 저장되므로, 나중에 몸무게를 고쳐도 지난 기록의
            볼륨은 그대로입니다. 미설정이면 맨몸 세트는 지금처럼 볼륨 0 으로
            계산됩니다.
          </p>
        </Section>

        <Section title="데이터">
          {storage ? (
            <div className="rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed text-muted">
              <p className="flex items-center gap-1.5">
                <HardDrive size={13} />
                사용 중 {(storage.usage / 1024).toFixed(0)}KB
                {storage.quota > 0
                  ? ` / ${(storage.quota / 1024 / 1024).toFixed(0)}MB`
                  : ""}
              </p>
              <p className="mt-1.5">
                저장소 보호:{" "}
                <span className={storage.persisted ? "text-success" : "text-danger"}>
                  {storage.persisted ? "켜짐" : "꺼짐"}
                </span>
              </p>
              {!storage.persisted && navigator.storage?.persist ? (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.storage.persist();
                    await refreshStorage();
                  }}
                  className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs text-text active:bg-surface-2"
                >
                  저장소 보호 요청
                </button>
              ) : null}
              <p className="mt-2">
                보호가 꺼져 있으면 브라우저가 공간 부족 시 기록을 지울 수
                있습니다. 정기적으로 아래에서 백업해 두세요.
              </p>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="lg"
              onClick={onExport}
              disabled={busy !== null}
            >
              <Download size={16} />
              백업 내보내기
            </Button>
            <Button
              className="flex-1"
              size="lg"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
            >
              <Upload size={16} />
              가져오기
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
            }}
          />
        </Section>

        <p className="pb-4 text-center text-xs text-muted">
          모든 기록은 이 기기 안에만 저장됩니다.
          {caps.standalone ? " (홈 화면에 설치됨)" : ""}
        </p>
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}
