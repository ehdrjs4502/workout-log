/**
 * 휴식 완료 알림. 플랫폼별 제약이 심해서 전부 "되면 하고 안 되면 조용히 넘어간다".
 * 어떤 게 실제로 동작하는지는 /settings 에서 capabilities() 로 사용자에게 그대로 보여준다.
 */

import { formatRest, formatTimeOfDay } from "@/lib/format/date";

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

/**
 * iOS 는 사용자 제스처 없이 오디오를 재생할 수 없다.
 * 세트 완료 버튼 핸들러의 "맨 앞"에서 동기적으로 불러 AudioContext 를 열어둬야
 * 나중에 타이머가 끝났을 때 프로그램적으로 소리를 낼 수 있다.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();

    // 무음 버퍼를 한 번 흘려보내야 iOS 가 컨텍스트를 실제로 활성화한다
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // 오디오를 못 쓰는 환경 — 진동/알림으로 대체된다
  }
}

/** 삐- 삐- 두 번. 오디오 파일 없이 오실레이터로 만든다. */
export function playBeep(): void {
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const at = start + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.24);
    }
  } catch {
    // ignore
  }
}

export function vibrate(pattern: number[] = [200, 100, 200]): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

/* ------------------------------ 휴식 알림 ------------------------------ */

/** 휴식 알림은 항상 하나만 유지한다. 같은 tag 로 덮어써서 알림창에 쌓이지 않게 한다. */
const REST_TAG = "rest";

/** vibrate / renotify 는 아직 TS 표준 NotificationOptions 에 없다 */
type RestNotificationOptions = NotificationOptions & {
  vibrate?: number[];
  renotify?: boolean;
};

/**
 * 알림을 띄울 수 있는 상태면 서비스워커 등록을 돌려준다.
 * 안드로이드는 new Notification() 생성자가 아예 던지기 때문에 이 경로가 사실상 유일하다.
 */
async function restRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  if (Notification.permission !== "granted") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

/**
 * 휴식 시작 — 소리 없이 "언제 끝나는지"를 알림창에 미리 깔아둔다.
 *
 * 백그라운드로 넘어가면 페이지 타이머가 스로틀링되고, 화면을 끄면 아예 얼어붙는다.
 * 그때는 아래 notifyRestDone() 이 제때 못 나간다. 웹에는 알림을 예약하는 수단이
 * (Push 를 빼면) 없으므로, 세트를 완료한 순간 — 페이지가 확실히 살아있는 그 시점에 —
 * 종료 예정 시각을 적은 알림을 먼저 띄워둔다. 이후 앱이 얼든 말든
 * 알림창을 내리면 언제 끝나는지는 항상 보인다.
 */
export async function notifyRestStarted(
  targetSec: number,
  endsAt: number,
): Promise<void> {
  const reg = await restRegistration();
  if (!reg) return;
  try {
    await reg.showNotification(`휴식 중 · ${formatRest(targetSec)}`, {
      body: `${formatTimeOfDay(endsAt)} 종료 예정`,
      tag: REST_TAG,
      silent: true,
      // 저절로 사라지면 안 된다 — 백그라운드에서는 이게 유일한 단서다
      requireInteraction: true,
      // 종료 시각을 timestamp 로 주면 안드로이드 알림창에서 위쪽에 머문다
      timestamp: endsAt,
      // sw.js 가 이걸 보고 탭해도 알림을 닫지 않는다
      data: { ongoing: true },
    } as RestNotificationOptions);
  } catch {
    // ignore
  }
}

/**
 * 휴식 종료 — 같은 tag 를 교체하면서 이번엔 울린다.
 *
 * 진동을 navigator.vibrate() 가 아니라 알림에 실어 보내는 이유:
 * 백그라운드 페이지에서 navigator.vibrate() 는 무시되지만,
 * 알림에 붙인 vibrate 는 OS 가 대신 울려준다.
 */
export async function notifyRestDone(withVibration: boolean): Promise<void> {
  const options: RestNotificationOptions = {
    body: "다음 세트 시작하세요",
    tag: REST_TAG,
    // tag 가 같아도 다시 알린다 (없으면 조용히 교체만 된다)
    renotify: true,
    requireInteraction: true,
    ...(withVibration ? { vibrate: [200, 100, 200] } : {}),
  };

  const reg = await restRegistration();
  if (reg) {
    try {
      await reg.showNotification("휴식 끝", options);
      return;
    } catch {
      // 아래 폴백으로
    }
  }

  // 서비스워커가 없는 데스크톱 브라우저용 폴백
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification("휴식 끝", options);
  } catch {
    // ignore
  }
}

/** 휴식이 끝나거나 취소되면 깔아둔 알림도 치운다. */
export async function clearRestNotification(): Promise<void> {
  const reg = await restRegistration();
  if (!reg) return;
  try {
    for (const n of await reg.getNotifications({ tag: REST_TAG })) n.close();
  } catch {
    // ignore
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export type AlertCapabilities = {
  secureContext: boolean;
  standalone: boolean;
  sound: boolean;
  vibration: boolean;
  notification: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  wakeLock: boolean;
};

export function capabilities(): AlertCapabilities {
  if (typeof window === "undefined") {
    return {
      secureContext: false,
      standalone: false,
      sound: false,
      vibration: false,
      notification: false,
      notificationPermission: "unsupported",
      wakeLock: false,
    };
  }
  const hasNotification = "Notification" in window;
  return {
    // http://192.168.x.x 로 열면 아래 기능이 통째로 죽는다
    secureContext: window.isSecureContext,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    sound: !!(window.AudioContext ?? (window as WebkitWindow).webkitAudioContext),
    vibration: "vibrate" in navigator,
    notification: hasNotification,
    notificationPermission: hasNotification ? Notification.permission : "unsupported",
    wakeLock: "wakeLock" in navigator,
  };
}
