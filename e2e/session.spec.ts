import { test, expect } from "./fixtures";

/**
 * 이 앱의 심장. 운동 시작 → 종목 추가 → 세트 기록 → 종료까지 한 번에 훑는다.
 * 시트(role=dialog), 네이티브 confirm, 휴식 타이머까지 E2E 의 주요 장치가 모두 등장한다.
 *
 * 주의: 시계를 가짜로 바꾸지 않는다. 휴식 타이머는 실제 벽시계대로 줄어든다.
 * 아래 '3:00' / '2:30' 단언은 두 줄이 1초 안에 끝난다는 것에 기대고 있어
 * 느린 머신에선 '2:29' 로 깨질 수 있다. page.clock 도입이 제대로 된 답이다.
 * → docs/e2e-playwright-mcp.md 4절(10)
 */

/** 종목 추가 시트를 열고 이름으로 하나 고른 뒤, 기구까지 고른다 */
async function addExercise(
  page: import("@playwright/test").Page,
  name: string,
  equipment = "바벨",
) {
  // 주의: 화면의 '종목 추가' 버튼과 시트 제목이 같은 글자다.
  //       시트가 열린 뒤에는 이름만으로 고르면 모호해지므로 dialog 로 범위를 좁힌다.
  await page.getByRole("button", { name: "종목 추가", exact: true }).click();

  const sheet = page.getByRole("dialog", { name: "종목 추가" });
  await expect(sheet).toBeVisible();

  await sheet.getByPlaceholder("종목 검색").fill(name);
  // 행 버튼의 접근성 이름은 "벤치프레스 가슴 · 휴식 180초" 처럼 부제까지 포함한다.
  // '인클라인 벤치프레스' 같은 형제와 섞이지 않도록 앞머리를 고정한다.
  await sheet.getByRole("button", { name: new RegExp(`^${name} `) }).click();

  // 두 번째 단계: 기구. 지난번 고른 것에는 '지난번' 표시가 붙어 이름이 "바벨 지난번" 이 된다
  await expect(sheet.getByText("어떤 기구로 하나요?")).toBeVisible();
  await sheet.getByRole("button", { name: new RegExp(`^${equipment}`) }).click();

  await expect(sheet).toBeHidden();
}

test("운동 시작 → 벤치프레스 2세트 → 종료까지", async ({ page, dialogs }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "운동 시작" }).click();
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]+$/);
  await expect(page.getByText("진행 중")).toBeVisible();
  await expect(page.getByText("아직 종목이 없습니다")).toBeVisible();

  await addExercise(page, "벤치프레스");
  await expect(page.getByRole("heading", { name: "벤치프레스" })).toBeVisible();

  // --- 1세트: ± 버튼으로 입력 ---
  // Stepper 의 <label> 에는 htmlFor 가 없어서 숫자 칸 자체에는 접근성 이름이 없다.
  // 대신 ± 버튼에 aria-label 이 있고, 실제 사용자도 이 버튼을 쓴다.
  // 바벨은 2.5kg 단위 → 20 에서 4번 누르면 30kg
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "무게 증가" }).click();
  }
  await page.getByRole("button", { name: "횟수 증가" }).click(); // 10 → 11
  await page.getByRole("button", { name: "8", exact: true }).click(); // RPE

  await page.getByRole("button", { name: "1세트 완료" }).click();

  // 기록된 세트 줄. formatSetWeight → "30kg", 사이의 × 는 공백으로 둘러싸여 있다
  await expect(page.getByText("30kg × 11")).toBeVisible();
  await expect(page.getByText("RPE 8")).toBeVisible();
  await expect(page.getByText("1종목 · 1세트")).toBeVisible();

  // --- 휴식 타이머가 자동으로 뜬다 (벤치프레스 기본 휴식 180초) ---
  await expect(page.getByText("휴식 중")).toBeVisible();
  await expect(page.getByText("3:00", { exact: true })).toBeVisible();

  // --- 2세트: 값은 직전 세트로 프리필되어 있다 ---
  await expect(page.getByRole("button", { name: "2세트 완료" })).toBeVisible();
  await page.getByRole("button", { name: "2세트 완료" }).click();
  await expect(page.getByText("1종목 · 2세트")).toBeVisible();

  // --- 종료: 네이티브 confirm 이 뜬다 ---
  // exact 를 빼면 휴식 바의 aria-label="휴식 종료" 까지 걸려 strict mode violation 이 난다.
  // getByRole 의 name 은 기본이 '부분 일치' 라는 걸 기억해 둘 것.
  await page.getByRole("button", { name: "종료", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  expect(dialogs).toContain("운동을 종료할까요?");

  // 홈의 '최근 기록' 에 방금 운동이 쌓였다
  await expect(page.getByText("아직 기록이 없습니다")).toBeHidden();
  await expect(page.getByRole("button", { name: "운동 시작" })).toBeVisible();
});

test("휴식 타이머는 ±30초로 조절하고 바로 끝낼 수 있다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "운동 시작" }).click();
  await addExercise(page, "벤치프레스");
  await page.getByRole("button", { name: "1세트 완료" }).click();

  await expect(page.getByText("3:00", { exact: true })).toBeVisible();

  // 주의: 이 버튼의 마이너스는 ASCII '-' 가 아니라 U+2212 다.
  await page.getByRole("button", { name: "−30초" }).click();
  await expect(page.getByText("2:30", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "+30초" }).click();
  await expect(page.getByText("3:00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "휴식 종료" }).click();
  await expect(page.getByText("휴식 중")).toBeHidden();
});

test("세트가 하나도 없으면 종료가 아니라 삭제를 묻는다", async ({ page, dialogs }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "운동 시작" }).click();
  await addExercise(page, "벤치프레스");

  await page.getByRole("button", { name: "종료", exact: true }).click();

  await expect(page).toHaveURL("http://localhost:3000/");
  expect(dialogs).toContain("기록된 세트가 없습니다. 이 운동을 지울까요?");
  // 지워졌으므로 '이어서 하기' 가 아니라 '운동 시작' 이 보인다
  await expect(page.getByRole("button", { name: "운동 시작" })).toBeVisible();
});

test("기록한 세트를 눌러 수정할 수 있다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "운동 시작" }).click();
  await addExercise(page, "벤치프레스");
  await page.getByRole("button", { name: "1세트 완료" }).click();
  await expect(page.getByText("20kg × 10")).toBeVisible();

  await page.getByRole("button", { name: /20kg/ }).click();

  const sheet = page.getByRole("dialog", { name: "벤치프레스 세트 수정" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "횟수 증가" }).click();
  await sheet.getByRole("button", { name: "저장" }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText("20kg × 11")).toBeVisible();
});

test("새로고침해도 진행 중인 운동이 이어진다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "운동 시작" }).click();
  await addExercise(page, "벤치프레스");
  await page.getByRole("button", { name: "1세트 완료" }).click();
  await expect(page.getByText("1종목 · 1세트")).toBeVisible();

  // IndexedDB 에 들어갔으므로 리로드에도 살아남는다.
  // fixtures 의 초기화 스크립트가 sessionStorage 가드를 쓰는 덕에 여기서 DB 가 날아가지 않는다.
  await page.reload();
  await expect(page.getByText("1종목 · 1세트")).toBeVisible();
  await expect(page.getByText("30kg × 10")).toBeHidden();
  await expect(page.getByText("20kg × 10")).toBeVisible();

  // 홈에서도 '진행 중인 운동' 으로 보인다
  await page.goto("/");
  await expect(page.getByText("진행 중인 운동")).toBeVisible();
  await expect(page.getByRole("button", { name: "이어서 하기" })).toBeVisible();
});

test("기구는 운동할 때 고르고, 다음번엔 그 기구가 기본값이 된다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "운동 시작" }).click();

  // 벤치프레스를 덤벨로. 덤벨도 2.5kg 단위다
  await addExercise(page, "벤치프레스", "덤벨");
  await expect(page.getByRole("button", { name: "기구 바꾸기 (지금 덤벨)" })).toBeVisible();

  // 잘못 골랐으면 카드에서 바로 바꾼다 — 머신은 5kg 단위라 20 → 25
  await page.getByRole("button", { name: "기구 바꾸기 (지금 덤벨)" }).click();
  const choose = page.getByRole("dialog", { name: "벤치프레스 기구" });
  await choose.getByRole("button", { name: /^머신/ }).click();
  await expect(choose).toBeHidden();
  await page.getByRole("button", { name: "무게 증가" }).click();
  await page.getByRole("button", { name: "1세트 완료" }).click();
  await expect(page.getByText("25kg × 10")).toBeVisible();

  // 같은 종목을 다시 넣으려 하면 방금 고른 머신이 '지난번' 으로 표시된다
  await page.getByRole("button", { name: "종목 추가", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "종목 추가" });
  await sheet.getByPlaceholder("종목 검색").fill("벤치프레스");
  await sheet.getByRole("button", { name: /^벤치프레스 / }).click();
  await expect(sheet.getByRole("button", { name: "머신 지난번" })).toBeVisible();
});

test("목록에 없는 기구는 직접 적고, 다음부터는 버튼으로 고른다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "운동 시작" }).click();

  // 1) 직접 입력: '기타' 대신 이름을 적는다
  await page.getByRole("button", { name: "종목 추가", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "종목 추가" });
  await sheet.getByPlaceholder("종목 검색").fill("덤벨로우");
  await sheet.getByRole("button", { name: /^덤벨로우 / }).click();
  await sheet.getByRole("textbox", { name: "기구 직접 입력" }).fill("케틀벨");
  await sheet.getByRole("button", { name: "사용" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByRole("button", { name: "기구 바꾸기 (지금 케틀벨)" })).toBeVisible();

  // 2) 다른 종목을 넣을 때도 방금 적은 '케틀벨' 이 선택지로 나온다
  await page.getByRole("button", { name: "종목 추가", exact: true }).click();
  await sheet.getByPlaceholder("종목 검색").fill("런지");
  await sheet.getByRole("button", { name: /^런지 / }).click();
  await sheet.getByRole("button", { name: "케틀벨", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "기구 바꾸기 (지금 케틀벨)" })).toHaveCount(2);

  // 3) 기구가 없는 종목은 '없음' 이 기본으로 잡혀 있다
  await page.getByRole("button", { name: "종목 추가", exact: true }).click();
  await sheet.getByPlaceholder("종목 검색").fill("플랭크");
  await sheet.getByRole("button", { name: /^플랭크 / }).click();
  await expect(sheet.getByRole("button", { name: "없음 지난번" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^기타/ })).toHaveCount(0);
});
