import { test as base, expect } from "@playwright/test";

type Fixtures = {
  /**
   * 이번 테스트에서 떠오른 네이티브 confirm/alert 의 메시지들.
   * 자동으로 accept 되며, 순서대로 여기에 쌓인다.
   */
  dialogs: string[];
};

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    /**
     * Playwright 는 테스트마다 새 BrowserContext 를 주므로 IndexedDB 는 원래도 비어 있다.
     * 그런데도 이걸 명시적으로 두는 이유:
     *  - 한 테스트 안에서 goto 를 여러 번 해도 시작점이 항상 같다고 보장된다
     *  - storageState 를 재사용하도록 설정을 바꿔도 안 깨진다
     *  - "이 앱의 상태는 IndexedDB 다" 라는 사실이 코드에 드러난다
     *
     * addInitScript 는 '모든' 내비게이션마다 다시 실행된다.
     * 가드가 없으면 seed 후 page.goto 를 한 번 더 하는 순간 심어둔 데이터가 날아간다.
     * sessionStorage 는 탭 수명 동안 유지되므로 '이 탭에서 이미 지웠는가' 플래그로 알맞다.
     */
    await page.addInitScript(() => {
      if (sessionStorage.getItem("__e2e_reset__")) return;
      sessionStorage.setItem("__e2e_reset__", "1");

      // deleteDatabase 요청은 같은 이름의 open 보다 먼저 큐에 들어간다.
      // IndexedDB 는 DB 이름마다 요청을 순서대로 처리하므로,
      // 뒤이어 로드되는 Dexie 는 '지워진 뒤'의 DB 를 열게 된다. await 가 필요 없는 이유다.
      indexedDB.deleteDatabase("workout-log");
      try {
        localStorage.clear(); // install-banner-dismissed
      } catch {
        /* 시크릿 모드 등 */
      }
    });

    /**
     * next dev 가 띄우는 개발용 오버레이(<nextjs-portal>)는 화면 아래쪽에 떠 있어서
     * 412px 폭에서는 하단 네비게이션 위에 겹친다. 그러면 Playwright 가
     * "<nextjs-portal> intercepts pointer events" 로 클릭을 30초간 재시도하다 죽는다.
     *
     * 앱 설정(next.config.ts)을 고치는 대신 테스트 쪽에서만 숨긴다.
     * 프로덕션 빌드로 돌리면 애초에 없는 요소라, 이건 dev 서버를 쓰는 값이다.
     */
    await page.addInitScript(() => {
      const hide = () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal{display:none!important}";
        document.head.appendChild(style);
      };
      if (document.head) hide();
      else document.addEventListener("DOMContentLoaded", hide, { once: true });
    });

    await use(page);
  },

  /**
   * 이 앱은 종료·삭제·가져오기에서 네이티브 confirm 을 쓴다.
   * Playwright 의 기본 동작은 dismiss 라서, 이 핸들러가 없으면
   * "종료" 를 눌러도 아무 일도 일어나지 않고 테스트만 조용히 실패한다.
   */
  dialogs: [
    async ({ page }, use) => {
      const seen: string[] = [];
      page.on("dialog", (dialog) => {
        seen.push(dialog.message());
        dialog.accept().catch(() => {
          /* 이미 닫힌 경우 */
        });
      });
      await use(seen);
    },
    { auto: true },
  ],
});

export { expect };
