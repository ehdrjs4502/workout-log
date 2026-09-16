import { test, expect } from "./fixtures";

/**
 * 종목 목록과 CRUD. 시드가 필요 없다 — Dexie 의 populate 훅이 심는 프리셋 44개로 충분하다.
 *
 * 이 화면의 함정 두 가지를 계속 마주친다:
 *  1) '{이름} 수정' 은 서로 포함 관계다. '벤치프레스 수정' 이 '덤벨 벤치프레스 수정',
 *     '인클라인 벤치프레스 수정' 까지 잡는다 → exact: true
 *  2) '가슴' '등' … 이 목록의 필터 칩이자 추가/수정 시트의 부위 선택 버튼이다.
 *     시트가 열려 있으면 두 개가 걸리므로 dialog 로 범위를 좁혀야 한다.
 */

const NEW_NAME = "E2E 테스트 종목";

/** 종목 추가 시트를 열어 이름만 채우고 저장한다 (부위·기구는 기본값) */
async function addExercise(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "추가" }).click();

  const sheet = page.getByRole("dialog", { name: "종목 추가" });
  await expect(sheet).toBeVisible();

  await sheet.getByRole("textbox", { name: "이름" }).fill(name);
  await sheet.getByRole("button", { name: "저장" }).click();

  await expect(sheet).toBeHidden();
}

/* ---------------------------- 목록 ---------------------------- */

test("프리셋 44개가 보이고 행마다 통계·수정·삭제가 붙어 있다", async ({ page }) => {
  await page.goto("/exercises");

  await expect(page.getByText("44개")).toBeVisible();

  // exact 를 빼면 '덤벨 벤치프레스 …' '인클라인 벤치프레스 …' 까지 걸린다
  await expect(
    page.getByRole("link", { name: "벤치프레스 통계", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "벤치프레스 수정", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "벤치프레스 삭제", exact: true }),
  ).toBeVisible();
});

test("검색하면 목록이 좁혀지지만 헤더 개수는 그대로다", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page.getByText("44개")).toBeVisible();

  await page.getByRole("searchbox", { name: "종목 검색" }).fill("벤치프레스");

  await expect(
    page.getByRole("button", { name: "벤치프레스 가슴 · 바벨 · 휴식 180초", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^딥스 / })).toBeHidden();

  // 헤더 숫자는 전체 개수다. 필터 결과가 아니다.
  await expect(page.getByText("44개")).toBeVisible();
});

test("없는 이름을 검색하면 빈 안내가 뜬다", async ({ page }) => {
  await page.goto("/exercises");

  await page.getByRole("searchbox", { name: "종목 검색" }).fill("zzzz없는종목");

  // 마침표까지 포함된 문구다
  await expect(page.getByText("검색 결과가 없습니다.")).toBeVisible();
});

test("부위 칩으로 목록을 거를 수 있다", async ({ page }) => {
  await page.goto("/exercises");

  // 시트가 안 열려 있으므로 여기서는 '가슴' 이 칩 하나뿐이다.
  // (섹션 제목 '가슴' 은 heading 이라 role 이 달라 안 걸린다)
  await page.getByRole("button", { name: "가슴", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "벤치프레스 가슴 · 바벨 · 휴식 180초", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^스쿼트 / })).toBeHidden();
});

/* ---------------------------- 추가 ---------------------------- */

test("이름이 비어 있으면 저장할 수 없다", async ({ page }) => {
  await page.goto("/exercises");
  await page.getByRole("button", { name: "추가" }).click();

  const sheet = page.getByRole("dialog", { name: "종목 추가" });
  const save = sheet.getByRole("button", { name: "저장" });

  // 이 화면의 유일한 입력 검증이다
  await expect(save).toBeDisabled();

  await sheet.getByRole("textbox", { name: "이름" }).fill("아무거나");
  await expect(save).toBeEnabled();
});

test("새 종목을 추가하면 목록과 개수에 반영된다", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page.getByText("44개")).toBeVisible();

  await addExercise(page, NEW_NAME);

  await expect(page.getByText("45개")).toBeVisible();
  // 부위·기구를 안 고르면 기본값은 '가슴 · 기타 · 휴식 90초'
  await expect(
    page.getByRole("button", {
      name: `${NEW_NAME} 가슴 · 기타 · 휴식 90초`,
      exact: true,
    }),
  ).toBeVisible();
});

test("추가를 취소하면 아무것도 늘지 않는다", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page.getByText("44개")).toBeVisible();

  await page.getByRole("button", { name: "추가" }).click();
  const sheet = page.getByRole("dialog", { name: "종목 추가" });
  await sheet.getByRole("textbox", { name: "이름" }).fill(NEW_NAME);
  await sheet.getByRole("button", { name: "취소" }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText("44개")).toBeVisible();
});

/* ------------------------- 수정 / 삭제 ------------------------- */

test("종목을 수정하면 목록의 이름이 바뀐다", async ({ page }) => {
  await page.goto("/exercises");

  // '딥스' 는 이름이 겹치는 형제가 없지만, 습관적으로 exact 를 붙인다
  await page.getByRole("button", { name: "딥스 수정", exact: true }).click();

  // 추가 시트와 제목이 다르다 ('종목 추가' vs '종목 수정') — 범위를 좁힐 때 쓴다
  const sheet = page.getByRole("dialog", { name: "종목 수정" });
  await expect(sheet).toBeVisible();

  await sheet.getByRole("textbox", { name: "이름" }).fill("딥스 변경됨");
  await sheet.getByRole("button", { name: "저장" }).click();

  await expect(sheet).toBeHidden();
  // 여기서 한 번 넘어졌다: /^딥스 변경됨 / 로 쓰면 행 버튼 말고
  // '딥스 변경됨 수정' '딥스 변경됨 삭제' 까지 세 개가 걸린다.
  // 이름 뒤의 공백은 부제 앞에도, '수정'/'삭제' 앞에도 똑같이 있기 때문이다.
  await expect(
    page.getByRole("button", {
      name: "딥스 변경됨 가슴 · 기타 · 휴식 120초",
      exact: true,
    }),
  ).toBeVisible();
  // 개수는 그대로다 (수정이지 추가가 아니다)
  await expect(page.getByText("44개")).toBeVisible();
});

test("삭제는 confirm 을 묻고, 수락하면 목록에서 빠진다", async ({ page, dialogs }) => {
  await page.goto("/exercises");
  await addExercise(page, NEW_NAME);
  await expect(page.getByText("45개")).toBeVisible();

  await page
    .getByRole("button", { name: `${NEW_NAME} 삭제`, exact: true })
    .click();

  await expect(page.getByText("44개")).toBeVisible();
  await expect(page.getByRole("button", { name: `${NEW_NAME} 수정` })).toBeHidden();

  // 종목 이름이 큰따옴표로 감싸이고, 두 줄짜리 메시지다. 추측하지 말고 그대로 적을 것.
  expect(dialogs).toContain(
    `"${NEW_NAME}"을(를) 목록에서 지울까요?\n이미 기록된 세트는 그대로 남습니다.`,
  );
});

test("삭제를 취소하면 목록에 그대로 남는다", async ({ page }) => {
  await page.goto("/exercises");
  await addExercise(page, NEW_NAME);
  await expect(page.getByText("45개")).toBeVisible();

  /**
   * fixtures 의 dialogs 픽스처는 auto: true 라 모든 테스트에서 confirm 을 자동 수락한다.
   * '취소' 쪽을 확인하려면 그 핸들러를 걷어내고 dismiss 하는 핸들러를 새로 걸어야 한다.
   * (두 핸들러가 같이 살아 있으면 '이미 처리된 다이얼로그' 에러가 난다)
   */
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => d.dismiss());

  await page
    .getByRole("button", { name: `${NEW_NAME} 삭제`, exact: true })
    .click();

  await expect(page.getByText("45개")).toBeVisible();
  await expect(
    page.getByRole("button", { name: `${NEW_NAME} 수정`, exact: true }),
  ).toBeVisible();
});
