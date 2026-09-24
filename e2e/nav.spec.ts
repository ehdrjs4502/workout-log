import { test, expect } from "./fixtures";

/**
 * 가장 단순한 스펙. role 셀렉터와 auto-waiting 에 익숙해지는 것이 목적이다.
 */

const TABS = [
  { label: "오늘", path: "/", heading: "운동 기록" },
  { label: "캘린더", path: "/calendar", heading: "캘린더" },
  { label: "통계", path: "/stats", heading: "통계" },
  { label: "종목", path: "/exercises", heading: "종목" },
  { label: "설정", path: "/settings", heading: "설정" },
];

test("하단 탭 5개가 모두 보인다", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation");
  for (const tab of TABS) {
    await expect(nav.getByRole("link", { name: tab.label })).toBeVisible();
  }
});

test("탭을 누르면 해당 화면으로 이동하고 현재 탭이 표시된다", async ({ page }) => {
  await page.goto("/");

  for (const tab of TABS) {
    await page.getByRole("navigation").getByRole("link", { name: tab.label }).click();

    await expect(page).toHaveURL(new RegExp(`${tab.path}$`));
    await expect(page.getByRole("heading", { name: tab.heading })).toBeVisible();

    // 활성 탭에는 aria-current="page" 가 붙는다 — 색상(CSS) 대신 이걸 단언한다
    await expect(
      page.getByRole("navigation").getByRole("link", { name: tab.label }),
    ).toHaveAttribute("aria-current", "page");
  }
});

test("로깅 화면에서는 하단 네비게이션이 사라진다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "운동 시작" }).click();

  await expect(page).toHaveURL(/\/session\//);
  // 하단은 휴식 타이머 바가 차지하므로 네비게이션은 렌더되지 않는다
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("첫 실행이면 기록이 비어 있고 프리셋 종목은 채워져 있다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("아직 기록이 없습니다")).toBeVisible();

  await page.goto("/exercises");
  // Dexie 의 'populate' 훅이 프리셋 44개를 자동으로 심는다.
  //
  // 이름 하나 고르는 데 두 번 걸려 넘어지는 자리다.
  //  1) /^벤치프레스/ → aria-label="벤치프레스 수정"/"벤치프레스 삭제" 까지 잡힌다
  //  2) 부제까지 적어도 → getByRole 의 name 은 기본이 '부분 일치' 라
  //     "인클라인 벤치프레스 가슴 · 휴식 180초" 가 이걸 포함해서 또 걸린다
  // 정답은 exact: true.
  await expect(
    page.getByRole("button", {
      name: "벤치프레스 가슴 · 휴식 180초",
      exact: true,
    }),
  ).toBeVisible();
  // 여기도 마찬가지 — '덤벨 벤치프레스 수정', '인클라인 벤치프레스 수정' 이 함께 걸린다
  await expect(
    page.getByRole("button", { name: "벤치프레스 수정", exact: true }),
  ).toBeVisible();
});

/**
 * 회귀: /settings/export 가 렌더 중에 navigator.share 를 직접 읽어서
 * 서버 HTML(공유 버튼 없음)과 클라이언트(있음)가 어긋나 하이드레이션 에러가 났다.
 * 탭 이동(클라이언트 내비게이션)으로는 안 보이고, 주소로 바로 열거나 새로고침할 때만 드러난다.
 * 그래서 모든 경로를 goto 로 직접 연다.
 *
 * 함정: 헤드리스 Chromium 에는 navigator.share 가 없어서 서버와 클라이언트가 우연히 일치한다.
 * 그대로 두면 이 테스트는 버그가 있어도 통과한다. 폰처럼 share 를 심어 둔다.
 */
test("어느 화면을 바로 열어도 런타임 에러가 없다", async ({ page }) => {
  await page.addInitScript(() => {
    if (!navigator.share) {
      Object.defineProperty(navigator, "share", { value: async () => {}, configurable: true });
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()} :: ${e.message.split("\n")[0]}`));

  const paths = [...TABS.map((t) => t.path), "/settings/export"];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole("navigation")).toBeVisible();
  }

  // 세션 화면도 (하단 네비게이션이 없는 화면)
  await page.goto("/");
  await page.getByRole("button", { name: "운동 시작" }).click();
  await expect(page).toHaveURL(/\/session\//);
  await page.reload();
  await expect(page.getByText("진행 중")).toBeVisible();

  expect(errors).toEqual([]);
});
