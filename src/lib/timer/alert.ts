/**
 * 휴식 완료 알림. 플랫폼별 제약이 심해서 전부 "되면 하고 안 되면 조용히 넘어간다".
 * 어떤 게 실제로 동작하는지는 /settings 에서 capabilities() 로 사용자에게 그대로 보여준다.
 */

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

export async function notify(title: string, body: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    // iOS PWA 는 ServiceWorkerRegistration.showNotification 만 허용한다
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, tag: "rest-done" });
      return;
    }
    new Notification(title, { body, tag: "rest-done" });
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
