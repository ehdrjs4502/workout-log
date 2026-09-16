import { test, expect } from "./fixtures";

/**
 * 설정 화면. 토글·스테퍼가 IndexedDB 에 저장되는지와, 백업 가져오기를 덮는다.
 *
 * 가져오기는 이 앱에서 가장 장치가 많은 흐름이다 —
 * 숨은 file input + confirm 두 단계 + 결과 alert 가 한 줄로 이어진다.
 *
 * 일부러 건드리지 않는 것 두 가지:
 *  - '알림' 스위치와 '알림 테스트' 버튼. 진짜 Notification 권한 프롬프트를 띄울 수 있어서
 *    (브라우저 권한 UI 는 페이지 밖이라 Playwright 가 못 만진다) 상태만 확인하고 누르지 않는다.
 *  - '사용 중 11683KB / 3083MB' 같은 저장소 숫자. 기기·환경마다 달라 단언할 수 없다.
 */

const SAMPLE_BACKUP = "e2e/fixtures/backup-sample.json";

/**
 * 파일 선택 input 은 className="hidden" 으로 숨겨져 있고, '가져오기' 버튼이 대신 click() 을 쏜다.
 * setInputFiles 는 숨은 input 에도 그대로 동작하므로 버튼을 거치지 않고 직접 넣는다.
 * (버튼을 눌러 네이티브 파일 선택창을 띄우고 page.on("filechooser") 로 받는 방법도 있지만,
 *  이쪽이 짧고 흔들림이 없다)
 */
const fileInput = (page: import("@playwright/test").Page) =>
  page.locator('input[type="file"]');

/* ---------------------------- 토글 ---------------------------- */

test("휴식 알림 토글의 기본 상태", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("switch", { name: "소리" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "진동" })).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "운동 중 화면 켜두기" }),
  ).toBeChecked();

  // 이 스위치의 접근성 이름에는 설명 문장까지 통째로 들어간다
  // ("알림 iOS는 홈 화면에 설치해야 동작합니다") → 앞머리만 잡는다
  await expect(page.getByRole("switch", { name: /^알림/ })).not.toBeChecked();
});

test("토글을 끄면 새로고침해도 꺼진 채로 남는다", async ({ page }) => {
  await page.goto("/settings");

  const sound = page.getByRole("switch", { name: "소리" });
  await sound.click();
  await expect(sound).not.toBeChecked();

  // 설정은 IndexedDB 에 들어가므로 리로드에도 살아남는다
  await page.reload();
  await expect(page.getByRole("switch", { name: "소리" })).not.toBeChecked();
  // 건드리지 않은 것은 그대로다
  await expect(page.getByRole("switch", { name: "진동" })).toBeChecked();
});

/* --------------------------- 스테퍼 --------------------------- */

test("몸무게는 미설정으로 시작하고 조절하면 저장된다", async ({ page }) => {
  await page.goto("/settings");

  // Stepper 의 숫자 칸에는 접근성 이름이 없다. ± 버튼에만 aria-label 이 있고,
  // 값 확인은 그 옆 textbox 를 순서로 집어야 한다 — 그래서 nth(1) 이다.
  // (0번은 '새 종목의 기본 휴식 시간')
  const weight = page.getByRole("textbox").nth(1);
  await expect(weight).toHaveValue("미설정");

  await page.getByRole("button", { name: "내 몸무게 (kg) 증가" }).click();
  await expect(weight).toHaveValue("0.5");

  await page.reload();
  await expect(page.getByRole("textbox").nth(1)).toHaveValue("0.5");
});

test("새 종목의 기본 휴식 시간도 저장된다", async ({ page }) => {
  await page.goto("/settings");

  const rest = page.getByRole("textbox").first();
  await expect(rest).toHaveValue("90");

  await page
    .getByRole("button", { name: "새 종목의 기본 휴식 시간 (초) 증가" })
    .click();
  await expect(rest).not.toHaveValue("90");

  const raised = await rest.inputValue();
  await page.reload();
  await expect(page.getByRole("textbox").first()).toHaveValue(raised);
});

/* --------------------------- 내보내기 --------------------------- */

test("기록 텍스트 내보내기로 이동한다", async ({ page }) => {
  await page.goto("/settings");

  await page.getByRole("link", { name: /기록 텍스트 내보내기/ }).click();

  await expect(page).toHaveURL(/\/settings\/export$/);
});

/* --------------------------- 가져오기 --------------------------- */

test("백업 파일이 아니면 실패를 알린다", async ({ page, dialogs }) => {
  await page.goto("/settings");

  // JSON 으로는 읽히지만 백업 모양이 아닌 파일.
  // 아예 깨진 텍스트를 주면 JSON.parse 가 브라우저마다 다른 문구로 던져서 단언이 흔들린다.
  await fileInput(page).setInputFiles({
    name: "notbackup.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":1}'),
  });

  await expect
    .poll(() => dialogs)
    .toContain("가져오기에 실패했습니다: 운동 기록 백업 파일이 아닙니다.");
});

test("백업을 합치면 기존 기록에 더해진다", async ({ page, dialogs }) => {
  await page.goto("/exercises");
  await expect(page.getByText("44개")).toBeVisible();

  await page.goto("/settings");
  await fileInput(page).setInputFiles(SAMPLE_BACKUP);

  // 첫 confirm 은 '합칠까요?' 다. fixtures 의 dialogs 픽스처가 자동 수락하므로 merge 로 간다.
  // 빈 줄(\n\n)까지 그대로 들어 있는 메시지다.
  await expect
    .poll(() => dialogs)
    .toContain(
      "기존 기록에 합칠까요?\n\n확인 = 합치기 (같은 기록은 최신 것으로)\n취소 = 전체 교체 (지금 기기의 기록을 모두 지웁니다)",
    );

  // 샘플 백업은 종목·세션·연결·세트 각 1건 = 4건이다
  await expect
    .poll(() => dialogs)
    .toContain("가져오기 완료\n새로 추가 4건 · 갱신 0건 · 건너뜀 0건");

  // 프리셋 44개는 그대로 있고 가져온 종목이 하나 늘었다
  await page.goto("/exercises");
  await expect(page.getByText("45개")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "가져오기 테스트 종목 가슴 · 바벨 · 휴식 120초",
      exact: true,
    }),
  ).toBeVisible();
});

test("전체 교체를 고르면 기존 기록이 사라진다", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page.getByText("44개")).toBeVisible();
  await page.goto("/settings");

  /**
   * 이 흐름만 다이얼로그를 세 번 만나고, 답이 서로 달라야 한다.
   *   1) "합칠까요?"        → 취소(dismiss) = 전체 교체를 고른다
   *   2) "정말 …교체할까요?"  → 확인(accept)
   *   3) 결과 alert          → 확인(accept)
   * fixtures 의 dialogs 픽스처는 전부 수락해 버리므로 여기서만 걷어내고 직접 건다.
   */
  const seen: string[] = [];
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => {
    seen.push(d.message());
    if (seen.length === 1) void d.dismiss();
    else void d.accept();
  });

  await fileInput(page).setInputFiles(SAMPLE_BACKUP);

  await expect
    .poll(() => seen)
    .toContain("정말 지금 기기의 모든 기록을 지우고 파일 내용으로 교체할까요?");
  await expect
    .poll(() => seen)
    .toContain("가져오기 완료\n새로 추가 4건 · 갱신 0건 · 건너뜀 0건");

  // 교체는 테이블을 통째로 비우고 넣는다 — 프리셋 44개까지 날아가고 백업의 1개만 남는다.
  // ('populate' 훅은 DB 를 만들 때 한 번만 돌므로 프리셋이 다시 생기지 않는다)
  await page.goto("/exercises");
  await expect(page.getByText("1개")).toBeVisible();
  // 이름 앞머리만 잡으면 행 버튼 말고 '… 수정' '… 삭제' 까지 세 개가 걸린다.
  // 이 함정은 이 프로젝트에서 계속 나온다 — 종목 행은 항상 전체 이름 + exact 로 잡을 것.
  await expect(
    page.getByRole("button", {
      name: "가져오기 테스트 종목 가슴 · 바벨 · 휴식 120초",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "벤치프레스 가슴 · 바벨 · 휴식 180초",
      exact: true,
    }),
  ).toBeHidden();
});
