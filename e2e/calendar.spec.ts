import { test, expect } from "./fixtures";
import { seedSessions } from "./seed";

/**
 * 달력 격자 · 월 이동 · 날짜 상세 시트.
 *
 * 이 화면의 테스트는 '지금 어느 달을 보고 있는가'에 전부 매여 있다.
 * 그래서 stats.spec.ts 가 쓰는 daysAgo() 같은 '며칠 전' 방식은 여기서 못 쓴다 —
 * 오늘이 1일이면 daysAgo(2) 가 지난달로 넘어가 버려서 '이번 달 2회' 가 깨진다.
 * 대신 '이번 달 10일' 처럼 달을 고정한 날짜를 만들어 쓴다.
 */

const pad = (v: number) => String(v).padStart(2, "0");
const key = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 헤더에 찍히는 '2026년 9월' 형식 */
const monthLabel = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월`;

/**
 * 10일과 20일만 쓰는 이유:
 *  - 어느 달에도 반드시 있다 (29·30·31 은 없는 달이 있다)
 *  - 격자 앞뒤에 끼어드는 '지난달/다음달 넘침' 날짜와 절대 안 겹친다.
 *    넘침은 길어야 양쪽 6칸이라 1~6 과 26~31 만 중복될 수 있다.
 *    실제로 9월 격자에는 "30" 이 두 개(8/30, 9/30), "1" "2" "3" 도 두 개씩 있다.
 */
const thisMonth = (day: number) => {
  const d = new Date();
  return key(new Date(d.getFullYear(), d.getMonth(), day));
};
const prevMonth = (day: number) => {
  const d = new Date();
  return key(new Date(d.getFullYear(), d.getMonth() - 1, day));
};
const thisMonthLabel = () => monthLabel(new Date());
const prevMonthLabel = () => {
  const d = new Date();
  return monthLabel(new Date(d.getFullYear(), d.getMonth() - 1, 1));
};

/**
 * 날짜 칸을 고르는 헬퍼.
 * 격자에는 접근성 이름이 붙은 컨테이너가 없어서 (div 라 스냅샷에도 generic 으로만 뜬다)
 * locator 로 범위를 좁힐 수가 없다. 그래서 exact: true 로 버티는 수밖에 없다.
 * name: "1" 을 exact 없이 쓰면 "10" "11" … "31" 까지 전부 걸린다는 걸 기억할 것.
 */
const dayCell = (page: import("@playwright/test").Page, day: number) =>
  page.getByRole("button", { name: String(day), exact: true });

/* ------------------------------------------------------------------ */

/**
 * 시드를 하지 않는 테스트는 seed 하는 describe 바깥에 둔다.
 * (stats.spec.ts 와 같은 이유 — 같은 context 에서 남의 DB 를 건드리지 않기 위해)
 */
test("기록이 없으면 0회만 보이고 총 볼륨은 아예 없다", async ({ page }) => {
  await page.goto("/calendar");

  await expect(page.getByText("이번 달")).toBeVisible();
  await expect(page.getByText("0회")).toBeVisible();

  // 볼륨은 monthStats.volume > 0 일 때만 렌더된다. '0kg' 이 아니라 '없다'.
  await expect(page.getByText("총 볼륨")).toBeHidden();
});

test("기록이 없으면 모든 날짜를 누를 수 없다", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByText("0회")).toBeVisible();

  // disabled 는 그 날 기록이 있느냐로만 정해진다 (미래/과거와 무관)
  await expect(dayCell(page, 10)).toBeDisabled();
  await expect(dayCell(page, 20)).toBeDisabled();
});

/* ------------------------------------------------------------------ */

test.describe("기록이 있을 때", () => {
  // 이번 달 10일: 60×10 + 60×9 + 60×8 = 1,620kg
  // 이번 달 20일: 80×10 + 80×8        = 1,440kg  → 이번 달 합계 3,060kg
  // 지난달 15일: 100×5 + 100×5        = 1,000kg
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("아직 기록이 없습니다")).toBeVisible();

    await seedSessions(page, [
      {
        date: thisMonth(10),
        exercises: [
          {
            name: "벤치프레스",
            sets: [
              { weightKg: 60, reps: 10 },
              { weightKg: 60, reps: 9 },
              { weightKg: 60, reps: 8 },
            ],
          },
        ],
      },
      {
        date: thisMonth(20),
        exercises: [
          {
            name: "스쿼트",
            sets: [
              { weightKg: 80, reps: 10 },
              { weightKg: 80, reps: 8 },
            ],
          },
        ],
      },
      {
        date: prevMonth(15),
        exercises: [
          {
            name: "데드리프트",
            sets: [
              { weightKg: 100, reps: 5 },
              { weightKg: 100, reps: 5 },
            ],
          },
        ],
      },
    ]);
  });

  test("기록이 있는 날만 누를 수 있다", async ({ page }) => {
    await page.goto("/calendar");

    await expect(dayCell(page, 10)).toBeEnabled();
    await expect(dayCell(page, 20)).toBeEnabled();
    await expect(dayCell(page, 11)).toBeDisabled();
  });

  test("월 요약에 횟수와 총 볼륨이 함께 나온다", async ({ page }) => {
    await page.goto("/calendar");

    await expect(page.getByText("2회")).toBeVisible();
    await expect(page.getByText("3,060kg")).toBeVisible();
  });

  test("날짜를 누르면 그 날의 기록이 시트로 열린다", async ({ page }) => {
    await page.goto("/calendar");
    await dayCell(page, 10).click();

    // 시트 제목은 '9월 10일 (수)' 처럼 요일까지 붙는다. 요일은 달마다 바뀌니
    // 월·일만 고정하고 정규식으로 잡는다.
    const now = new Date();
    const sheet = page.getByRole("dialog", {
      name: new RegExp(`${now.getMonth() + 1}월 10일`),
    });
    await expect(sheet).toBeVisible();

    // seed 의 기본 durationMin 은 60 → formatDurationMs 가 '1시간 0분' 으로 적는다
    await expect(sheet.getByText("벤치프레스")).toBeVisible();
    await expect(sheet.getByText("3세트 · 1시간 0분 · 1,620kg")).toBeVisible();
  });

  test("시트의 기록을 누르면 그 날의 세션 화면으로 간다", async ({ page }) => {
    await page.goto("/calendar");
    await dayCell(page, 20).click();

    const now = new Date();
    const sheet = page.getByRole("dialog", {
      name: new RegExp(`${now.getMonth() + 1}월 20일`),
    });
    await sheet.getByRole("link", { name: /스쿼트/ }).click();

    await expect(page).toHaveURL(/\/session\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "스쿼트" })).toBeVisible();
  });

  test("이전 달로 넘어가면 그 달의 집계가 보인다", async ({ page }) => {
    await page.goto("/calendar");
    await expect(
      page.getByRole("heading", { name: thisMonthLabel() }),
    ).toBeVisible();

    await page.getByRole("button", { name: "이전 달" }).click();

    await expect(
      page.getByRole("heading", { name: prevMonthLabel() }),
    ).toBeVisible();
    // 주의: 지난달을 보고 있어도 라벨은 계속 '이번 달' 이다 (문구 이슈 — 숫자는 맞다).
    //       그래서 라벨은 단언하지 않고 집계 숫자만 본다.
    await expect(page.getByText("1회")).toBeVisible();
    await expect(page.getByText("1,000kg")).toBeVisible();
    await expect(dayCell(page, 15)).toBeEnabled();
  });

  test("오늘 버튼을 누르면 이번 달로 돌아온다", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(
      page.getByRole("heading", { name: prevMonthLabel() }),
    ).toBeVisible();

    // 하단 네비에도 '오늘' 이 있다. 저쪽은 link, 이쪽은 button 이라 role 로 갈린다.
    // getByText("오늘") 로 쓰면 두 개가 걸려서 깨진다.
    await page.getByRole("button", { name: "오늘" }).click();

    await expect(
      page.getByRole("heading", { name: thisMonthLabel() }),
    ).toBeVisible();
  });
});
