import { test, expect } from "./fixtures";
import { seedSessions, daysAgo } from "./seed";

/**
 * 과거 데이터를 심고 쓰는 첫 스펙.
 * 순서가 중요하다: goto(앱이 DB 생성·프리셋 시딩) → seed(생 IndexedDB 쓰기) → goto(다시 읽기).
 * Dexie 의 useLiveQuery 는 자기 커넥션의 쓰기만 감지하므로 seed 후에는 반드시 다시 열어야 한다.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // 앱이 DB 를 만들고 프리셋을 심을 때까지 기다린다. 화면에 뭔가 그려졌다는 건
  // Dexie 가 이미 DB 를 열었다는 뜻이다 (seed.ts 도 자체 대기를 하지만, 의도를 드러내 둔다).
  await expect(page.getByText("아직 기록이 없습니다")).toBeVisible();

  await seedSessions(page, [
    {
      date: daysAgo(0),
      durationMin: 68,
      exercises: [
        {
          name: "벤치프레스",
          sets: [
            { weightKg: 60, reps: 10, rpe: 7, restSec: 95 },
            { weightKg: 60, reps: 9, rpe: 8, restSec: 120 },
            { weightKg: 55, reps: 8, rpe: 9 },
          ],
        },
        { name: "랫풀다운", sets: [{ weightKg: 50, reps: 12, rpe: 7 }] },
      ],
    },
    {
      date: daysAgo(10),
      exercises: [{ name: "스쿼트", sets: [{ weightKg: 80, reps: 5 }] }],
    },
  ]);
});

test("오늘 기록을 간단 형식으로 미리보고 복사한다", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/settings/export");

  const preview = page.locator("pre");

  // 기본 기간은 '오늘', 기본 형식은 '간단'
  await expect(preview).toContainText("벤치프레스 (바벨) 60kgx10, 60kgx9, 55kgx8");
  // 기구가 '기타' 가 아니면 이름 뒤에 괄호로 붙는다
  await expect(preview).toContainText("랫풀다운 (머신) 50kgx12");
  // 10일 전 스쿼트는 '오늘' 범위 밖이다
  await expect(preview).not.toContainText("스쿼트");

  await page.getByRole("button", { name: "복사" }).click();

  // 버튼이 1800ms 동안 '복사됨' 으로 바뀐다
  await expect(page.getByRole("button", { name: "복사됨" })).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("벤치프레스 (바벨) 60kgx10");
});

test("상세 형식은 RPE·휴식·총 볼륨까지 담는다", async ({ page }) => {
  await page.goto("/settings/export");
  await page.getByRole("button", { name: "상세 (휴식·RPE 포함)" }).click();

  const preview = page.locator("pre");
  await expect(preview).toContainText("### 벤치프레스 (바벨)");
  await expect(preview).toContainText("1. 60kg x 10  RPE 7  (휴식 1:35)");
  await expect(preview).toContainText("3. 55kg x 8  RPE 9");
  // formatDurationMs 는 60분을 넘으면 "1시간 8분" 으로 적는다
  await expect(preview).toContainText("1시간 8분");
  // 60*10 + 60*9 + 55*8 + 50*12 = 2180
  await expect(preview).toContainText("총 볼륨 2,180kg");
});

test("기간을 넓히면 지난 기록도 들어온다", async ({ page }) => {
  await page.goto("/settings/export");
  const preview = page.locator("pre");

  await expect(preview).not.toContainText("스쿼트");

  await page.getByRole("button", { name: "30일" }).click();
  await expect(preview).toContainText("스쿼트 (바벨) 80kgx5");
  await expect(preview).toContainText("벤치프레스");
});

test("'직접' 기간은 날짜 두 칸으로 범위를 정한다", async ({ page }) => {
  await page.goto("/settings/export");
  await page.getByRole("button", { name: "직접" }).click();

  // 네이티브 date input. label 이 <label> 안에 감싸여 있어 getByLabel 이 통한다.
  await page.getByLabel("시작").fill(daysAgo(11));
  await page.getByLabel("끝").fill(daysAgo(9));

  const preview = page.locator("pre");
  await expect(preview).toContainText("스쿼트 (바벨) 80kgx5");
  await expect(preview).not.toContainText("벤치프레스");
});

test("기록이 없는 기간이면 빈 안내가 뜬다", async ({ page }) => {
  await page.goto("/settings/export");
  await page.getByRole("button", { name: "직접" }).click();
  await page.getByLabel("시작").fill(daysAgo(400));
  await page.getByLabel("끝").fill(daysAgo(380));

  await expect(page.locator("pre")).toHaveText("이 기간에 기록된 세트가 없습니다.");
  await expect(page.getByRole("button", { name: "복사" })).toBeDisabled();
});
