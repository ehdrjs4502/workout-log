import { defineConfig, devices } from "@playwright/test";

/**
 * 이 앱은 서버가 없다. 모든 상태가 브라우저 IndexedDB('workout-log') 안에 있어서
 * 흔히 쓰는 API 목킹(page.route)이 통하지 않고, 격리는 e2e/fixtures.ts 가 담당한다.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",

    // public/sw.js 는 navigation 을 network-first 로 가로채고 실패 시 캐시된 '/' 를 준다.
    // localhost 도 secure context 라 그냥 두면 등록되고, 테스트 간 낡은 shell 이 샌다.
    serviceWorkers: "block",

    // Session.date 는 'YYYY-MM-DD' 로컬 기준이다. 타임존이 흔들리면 캘린더/통계가 하루씩 밀린다.
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },

  // 레이아웃이 max-w-md 모바일 전용이라 데스크톱 뷰포트로 돌리면 하단 네비/휴식 바가 어색해진다.
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000, // Next 16 Turbopack 초회 컴파일이 느리다
  },
});
