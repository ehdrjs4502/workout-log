import { test, expect } from "./fixtures";
import { seedSessions, daysAgo } from "./seed";

/**
 * 시드 데이터를 읽어서 그리는 화면. 쿼리스트링 라우팅과 SVG 차트 단언이 주제다.
 * 차트는 그림이라 좌표를 검사하지 않는다. role="img" + aria-label 과,
 * 같은 숫자를 글자로도 보여주는 '날짜별' 목록을 단언한다.
 */

test.describe("기록이 있을 때", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("아직 기록이 없습니다")).toBeVisible();

    await seedSessions(page, [
      {
        date: daysAgo(14),
        exercises: [
          { name: "벤치프레스", sets: [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 8 }] },
        ],
      },
      {
        date: daysAgo(7),
        exercises: [
          { name: "벤치프레스", sets: [{ weightKg: 65, reps: 8 }] },
          { name: "스쿼트", sets: [{ weightKg: 100, reps: 5 }] },
        ],
      },
      {
        date: daysAgo(1),
        exercises: [{ name: "벤치프레스", sets: [{ weightKg: 70, reps: 6 }] }],
      },
    ]);
  });

  test("종목별 추이에 볼륨·횟수 두 패널이 그려진다", async ({ page }) => {
    await page.goto("/stats");

    // 고른 종목이 없으면 이 기간에 가장 많이 한 종목이 먼저 뜬다 (busiestExerciseId)
    await expect(page.getByRole("button", { name: /벤치프레스/ })).toBeVisible();

    // 단위가 다르면 축이 아니라 그래프를 나눈다 — 그래서 패널이 둘이다
    await expect(page.getByRole("img", { name: "총 볼륨 (kg)" })).toBeVisible();
    await expect(page.getByRole("img", { name: "총 횟수 (회)" })).toBeVisible();

    // 요약 줄: 3일 · (600+480+520+420=2020)kg · 4세트 · 최고 70kg
    await expect(page.getByText("3일 · 2,020kg · 4세트")).toBeVisible();
    await expect(page.getByText("최고 70kg")).toBeVisible();

    // 차트의 값은 '날짜별' 목록에서 글자로도 읽힌다
    await expect(page.getByRole("heading", { name: "날짜별" })).toBeVisible();
    await expect(page.getByText("60kg×10, 60kg×8")).toBeVisible();
  });

  test("종목을 바꾸면 추이도 따라 바뀐다", async ({ page }) => {
    await page.goto("/stats");
    await page.getByRole("button", { name: /벤치프레스/ }).click();

    const sheet = page.getByRole("dialog", { name: "종목 선택" });
    await expect(sheet).toBeVisible();
    await sheet.getByPlaceholder("종목 검색").fill("스쿼트");
    await sheet.getByRole("button", { name: /^스쿼트 / }).click();

    await expect(sheet).toBeHidden();
    await expect(page.getByText("1일 · 500kg · 1세트")).toBeVisible();
    await expect(page.getByText("100kg×5")).toBeVisible();
  });

  test("?exercise= 딥링크로 특정 종목을 바로 연다", async ({ page }) => {
    // /exercises 의 '통계' 버튼이 만드는 링크와 같은 모양이다
    await page.goto("/exercises");
    await page.getByRole("link", { name: "스쿼트 통계" }).click();

    await expect(page).toHaveURL(/\/stats\?exercise=/);
    await expect(page.getByText("1일 · 500kg · 1세트")).toBeVisible();
  });

  test("부위별 보기는 비중 막대를 함께 보여준다", async ({ page }) => {
    await page.goto("/stats");
    await page.getByRole("button", { name: "부위별" }).click();

    await expect(page.getByRole("heading", { name: "부위별 비중" })).toBeVisible();
    // 기본 선택은 가슴. 벤치프레스 2,020kg / 전체 2,520kg = 80%
    await expect(page.getByText("2,020kg (80%)")).toBeVisible();
    await expect(page.getByText("500kg (20%)")).toBeVisible();

    await page.getByRole("button", { name: "하체" }).click();
    await expect(page.getByText("이 기간에 하체 기록이 없습니다")).toBeHidden();
    await expect(page.getByRole("img", { name: "총 볼륨 (kg)" })).toBeVisible();
  });

  test("기간을 좁히면 범위 밖 기록이 빠진다", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.getByText("3일 · 2,020kg · 4세트")).toBeVisible();

    // 1개월은 기본값(3개월)보다 좁지만 모든 시드가 2주 안이라 결과는 같다.
    // 대신 버킷이 주 → 일로 바뀐다.
    await page.getByRole("button", { name: "1개월" }).click();
    await expect(page.getByText("3일 · 2,020kg · 4세트")).toBeVisible();
  });
});

/**
 * 시드를 하지 않는 테스트. 같은 context 안에서 남의 DB 를 지우면
 * "Another connection wants to delete database" 경고와 함께 다른 테스트를 방해한다.
 * 그래서 seed 하는 describe 바깥에 둔다 — 여기선 fixtures 의 초기화만으로 충분하다.
 */
test("기록이 하나도 없으면 빈 상태를 보여준다", async ({ page }) => {
  await page.goto("/stats");

  await expect(page.getByText("이 기간에 기록이 없습니다")).toBeVisible();
  await expect(page.getByText("운동을 기록하면 여기에 추이가 쌓입니다.")).toBeVisible();
});
