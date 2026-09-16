# Playwright MCP로 배우는 E2E 테스트

이 문서는 workout-log 프로젝트를 교보재로 삼아 Playwright MCP와 `@playwright/test`를
익히기 위한 기록이다. 개념 → 실습 → 이 앱 고유의 함정 순으로 읽으면 된다.

---

## 1. Playwright MCP란 무엇인가

MCP(Model Context Protocol)는 AI 에이전트가 외부 도구를 쓰기 위한 표준 규약이다.
**Playwright MCP**는 그 규약을 따르는 서버로, "브라우저를 조작하는 능력"을 도구 목록으로 노출한다.

```
┌──────────────┐   stdio (JSON-RPC)   ┌──────────────────┐   CDP   ┌──────────┐
│ Claude Code  │ ───────────────────▶ │ @playwright/mcp  │ ──────▶ │ Chromium │
│  (에이전트)   │ ◀─────────────────── │   (MCP 서버)      │ ◀────── │          │
└──────────────┘  도구 목록 / 결과      └──────────────────┘         └──────────┘
```

1. Claude Code가 시작할 때 `.mcp.json`을 읽어 `npx @playwright/mcp@latest`를 자식 프로세스로 띄운다
2. 서버가 자기 도구 목록(`browser_navigate`, `browser_click`, …)을 알려준다
3. 에이전트가 도구를 호출하면 서버가 Playwright API를 실행하고 결과를 돌려준다

이 프로젝트의 설정은 [.mcp.json](../.mcp.json)에 있다:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--isolated", "--caps=testing"]
    }
  }
}
```

- `--isolated` — 브라우저 프로필을 디스크에 남기지 않는다. 이 앱은 모든 상태가 IndexedDB에
  있으므로, 프로필이 남으면 **지난 실습의 운동 기록이 다음 실습에 그대로 섞여 들어온다**
- `--caps=testing` — `browser_verify_*`, `browser_generate_locator` 같은 테스트 작성용 도구를 켠다

> MCP 서버는 Claude Code 시작 시에 붙는다. `.mcp.json`을 추가한 뒤에는 **세션을 다시 띄워야**
> 도구가 보인다. 또 프로젝트 스코프 설정은 첫 실행 때 승인을 한 번 물어본다.

### 왜 스크린샷이 아니라 접근성 트리인가

`browser_snapshot`이 돌려주는 것은 이미지가 아니라 **접근성 트리(YAML)** 다.

```yaml
- banner:
  - heading "운동 기록" [level=1]
- main:
  - button "운동 시작" [ref=e17]
  - heading "최근 기록" [level=2]
  - paragraph: 아직 기록이 없습니다
- navigation:
  - link "오늘" [ref=e23] [active]
  - link "캘린더" [ref=e24]
```

여기서 얻는 것:

| | 스크린샷 + 좌표 | 접근성 트리 + ref |
|---|---|---|
| 모델 요구사항 | 비전 모델 필요 | 텍스트만으로 충분 |
| 토큰 비용 | 이미지 한 장당 큼 | 수십~수백 토큰 |
| 안정성 | 레이아웃 1px 변화에 깨짐 | 구조가 같으면 유지 |
| 부수 효과 | — | **접근성이 나쁘면 자동화도 어렵다는 게 드러난다** |

마지막 줄이 중요하다. 이 앱에서 `Stepper`의 숫자 칸은 `<label>`에 `htmlFor`가 없어서
접근성 이름이 아예 없다. 스냅샷에도 이름 없는 `textbox`로 뜬다.
**자동화가 어려운 곳은 스크린리더 사용자도 어려운 곳이다.**

---

## 2. 도구 카탈로그

| 분류 | 도구 | 쓰는 때 |
|---|---|---|
| 이동 | `browser_navigate`, `browser_navigate_back`, `browser_tabs` | URL 열기, 뒤로, 탭 전환 |
| 관찰 | `browser_snapshot` | **가장 많이 쓴다.** 현재 화면의 접근성 트리 |
| | `browser_take_screenshot` | 눈으로 봐야 할 때만 (레이아웃 깨짐 등) |
| | `browser_find` | 큰 페이지에서 요소 찾기 |
| 조작 | `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option` | ref를 받아 동작 |
| | `browser_press_key`, `browser_hover`, `browser_drag` | |
| 대기 | `browser_wait_for` | 텍스트가 나타나거나 사라질 때까지 |
| 실행 | `browser_evaluate` | 페이지 안에서 JS 실행 — **이 앱에선 IndexedDB 조작에 쓴다** |
| 진단 | `browser_console_messages`, `browser_network_requests` | 콘솔 에러, 요청 목록 |
| 저장소 | `browser_localstorage_set`, `browser_cookie_set`, `browser_storage_state` | 로그인 상태 재현 등 |
| 테스트(`--caps=testing`) | `browser_verify_element_visible`, `browser_verify_text_visible` | 단언을 도구로 표현 |
| | `browser_generate_locator` | **MCP → spec 코드 변환의 핵심.** 요소의 권장 로케이터를 뽑는다 |

### 한 턴의 실제 흐름

"운동을 시작하고 벤치프레스를 추가해줘" 한 마디는 대략 이렇게 풀린다:

```
browser_navigate("http://localhost:3000")
  → 스냅샷: button "운동 시작" [ref=e17]
browser_click(element="운동 시작 버튼", ref="e17")
  → 스냅샷: URL이 /session/… 으로 바뀜, button "종목 추가" [ref=e31]
browser_click(element="종목 추가 버튼", ref="e31")
  → 스냅샷: dialog "종목 추가" 안에 searchbox [ref=e40]
browser_type(element="종목 검색", ref="e40", text="벤치프레스")
  → 스냅샷: button "벤치프레스 가슴 · 바벨 · 휴식 180초" [ref=e52]
browser_click(element="벤치프레스 행", ref="e52")
```

`ref`는 **그 스냅샷 시점에만 유효한 임시 핸들**이다. 화면이 바뀌면 새 스냅샷을 찍어
새 ref를 받아야 한다. 그래서 MCP 흐름은 자연히 `동작 → 관찰 → 동작` 의 반복이 된다.

---

## 3. MCP와 `@playwright/test`는 다른 물건이다

가장 헷갈리는 지점이다.

| | Playwright MCP | @playwright/test |
|---|---|---|
| 정체 | 에이전트가 브라우저를 쓰는 **도구 서버** | **테스트 러너** |
| 실행 주체 | Claude가 대화 중에 | `pnpm test:e2e` 로 사람이/CI가 |
| 입력 | 자연어 | `.spec.ts` 코드 |
| 결과 | 대화에만 남는다 | 파일 · 리포트 · trace로 남는다 |
| 반복 가능 | ✗ (매번 조금씩 다르게 행동한다) | ✓ (같은 입력 → 같은 결과) |
| 쓰는 때 | 탐색, 디버깅, 초안 작성, 원인 추적 | 회귀 방지 |

**MCP는 손, spec 파일은 기억이다.** 실무 흐름은 이렇다:

1. MCP로 앱을 직접 몰아보며 화면 구조와 실제 문구를 파악한다
2. `browser_generate_locator`로 각 요소의 로케이터를 뽑는다
3. 그걸 `.spec.ts`로 옮겨 굳힌다 → 이제 사람 없이도 매번 돌아간다
4. 나중에 테스트가 깨지면 다시 MCP로 그 화면을 열어 무엇이 변했는지 본다

MCP만 쓰면 회귀 테스트가 없고, spec만 쓰면 처음 화면을 파악하는 데 시간이 오래 걸린다.

---

## 4. 이 프로젝트의 테스트 구조

```
playwright.config.ts   설정 (뷰포트·타임존·서비스워커·dev 서버)
e2e/
  fixtures.ts          격리된 page 픽스처 + 다이얼로그 자동 처리
  seed.ts              IndexedDB에 과거 기록을 직접 심는 헬퍼
  nav.spec.ts          하단 탭 이동
  session.spec.ts      운동 시작 → 세트 기록 → 종료 (핵심 플로우)
  export.spec.ts       텍스트 내보내기
  stats.spec.ts        통계/추이
```

```bash
pnpm test:e2e                    # 전부 실행
pnpm test:e2e:ui                 # UI 모드 (타임라인 + DOM 스냅샷, 학습에 가장 좋다)
pnpm exec playwright test --debug         # 단계별로 멈춰가며
pnpm exec playwright test -g "휴식 타이머"  # 이름으로 골라 실행
pnpm exec playwright test --repeat-each=3 # 격리가 진짜인지 확인
pnpm exec playwright show-report          # 마지막 결과 리포트
```

### 이 앱은 서버가 없다 — 그래서 격리가 특이하다

보통의 E2E는 `page.route()`로 API를 가로채 가짜 응답을 준다.
**이 앱에는 API가 없다.** 모든 상태가 브라우저 IndexedDB(`workout-log`)에 있다.
따라서 "테스트 데이터 준비"는 곧 "IndexedDB에 직접 쓰기"다.

[e2e/fixtures.ts](../e2e/fixtures.ts):

```ts
await page.addInitScript(() => {
  if (sessionStorage.getItem("__e2e_reset__")) return;   // ← 가드가 핵심
  sessionStorage.setItem("__e2e_reset__", "1");
  indexedDB.deleteDatabase("workout-log");
  localStorage.clear();
});
```

세 가지가 들어 있다:

- **`addInitScript`를 쓰는 이유** — 페이지 스크립트보다 먼저 실행된다.
  `goto` 후에 지우려 하면 Dexie가 이미 커넥션을 잡고 있어 삭제가 `blocked` 된다.
- **`await`이 없어도 되는 이유** — IndexedDB는 DB 이름마다 요청을 순서대로 처리한다.
  `deleteDatabase`가 먼저 큐에 들어갔으므로, 뒤이어 실행될 Dexie의 `open`은 삭제가 끝난 뒤에 열린다.
- **`sessionStorage` 가드가 필요한 이유** — `addInitScript`는 **모든 내비게이션마다** 다시 돈다.
  가드가 없으면 데이터를 심고 `page.goto`를 한 번 더 하는 순간 전부 날아간다.

> 참고: Playwright는 테스트마다 새 BrowserContext를 주므로 IndexedDB는 원래도 비어 있다.
> 이 초기화를 명시적으로 두는 건 (1) 한 테스트 안에서 `goto`를 여러 번 해도 시작점이 같고
> (2) 나중에 `storageState`를 재사용하도록 바꿔도 안 깨지며
> (3) "이 앱의 상태는 IndexedDB다"라는 사실이 코드에 드러나기 때문이다.

[e2e/seed.ts](../e2e/seed.ts)의 사용 순서:

```ts
await page.goto("/");                    // 앱이 DB를 만들고 프리셋 44개를 시딩
await expect(page.getByText("아직 기록이 없습니다")).toBeVisible();
await seedSessions(page, [...]);         // 생 IndexedDB 커넥션으로 과거 기록 쓰기
await page.goto("/stats");               // 다시 읽기 (필수!)
```

마지막 줄이 빠지면 화면이 안 바뀐다. `useLiveQuery`는 **Dexie 자신의 쓰기만** 감지하기 때문이다.

---

## 5. 이 앱에서 실제로 밟은 지뢰들

전부 테스트를 쓰면서 실제로 겪은 것이고, 코드에 주석으로도 남겨두었다.

### (1) `getByRole`의 `name`은 기본이 **부분 일치**다

세 번 연속으로 여기서 넘어졌다.

```ts
page.getByRole("button", { name: "종료" })
// ✗ 휴식 바의 aria-label="휴식 종료" 까지 걸린다

page.getByRole("button", { name: "벤치프레스 가슴 · 바벨 · 휴식 180초" })
// ✗ "인클라인 벤치프레스 가슴 · 바벨 · 휴식 180초" 가 이 문자열을 포함한다

page.getByRole("button", { name: "벤치프레스 수정" })
// ✗ "덤벨 벤치프레스 수정", "인클라인 벤치프레스 수정" 도 걸린다
```

답은 `exact: true`. 그리고 Playwright의 **strict mode**는 이런 모호함을 조용히 넘기지 않고
"resolved to 3 elements" 라며 후보를 전부 보여준다 — 매우 친절한 에러다.

### (2) 접근성 이름은 자식 텍스트가 전부 합쳐진다

종목 행 버튼의 이름은 `"벤치프레스"`가 아니라
`"벤치프레스 가슴 · 바벨 · 휴식 180초"` 다. 부제까지 한 버튼 안에 들어 있기 때문이다.
스냅샷이나 strict mode 에러를 보면 실제 이름을 바로 알 수 있으니, 추측하지 말고 한 번 돌려볼 것.

### (3) 네이티브 `confirm`은 기본이 **dismiss**다

이 앱은 운동 종료·기록 삭제·종목 빼기·가져오기에서 `window.confirm`을 쓴다.
Playwright는 다이얼로그를 **자동으로 취소**한다. 핸들러를 안 걸면
"종료" 버튼을 눌러도 아무 일도 일어나지 않고, 왜 실패했는지도 안 보인다.

```ts
page.on("dialog", (d) => { seen.push(d.message()); d.accept(); });
```

fixtures의 `dialogs` 픽스처가 이걸 자동으로 해주면서 메시지를 배열에 모아둔다.
그래서 테스트에서 `expect(dialogs).toContain("운동을 종료할까요?")` 로 확인할 수 있다.

### (4) `next dev`의 개발 오버레이가 클릭을 가로챈다

412px 폭에서 `<nextjs-portal>`이 하단 네비게이션 위에 겹쳐서
`"<nextjs-portal> intercepts pointer events"` 로 30초를 버티다 죽었다.
앱 설정을 고치는 대신 테스트에서만 CSS로 숨겼다 (프로덕션 빌드에는 없는 요소다).

### (5) 버전 없는 `indexedDB.open()`이 프리셋을 날린다

seed 헬퍼를 처음 썼을 때 `"One of the specified object stores was not found"` 가 났다.

`indexedDB.open(name)`을 버전 없이 부르는데 **DB가 아직 없으면 빈 v1 DB를 새로 만든다.**
그 뒤에 Dexie가 열면 `oldVersion`이 0이 아니게 되어 `populate` 훅이 영영 돌지 않고,
프리셋 종목 44개가 통째로 사라진다. `page.goto` 직후에는 React가 첫 쿼리를 쏘기 전일 수 있어서
이 경주가 실제로 일어난다.

해결: `indexedDB.databases()`로 **존재를 먼저 확인**하고, 오브젝트 스토어가 다 생길 때까지 기다린다.

### (6) 서비스워커

`public/sw.js`는 내비게이션을 network-first로 가로채고 실패하면 캐시된 `/`를 준다.
`localhost`도 secure context라 그냥 두면 등록되어 낡은 shell이 테스트 사이로 샌다.
`playwright.config.ts`의 `serviceWorkers: "block"` 한 줄로 막는다.

### (7) 타임존과 뷰포트

- `Session.date`는 `'YYYY-MM-DD'` **로컬** 기준이다. 타임존이 다르면 캘린더/통계가 하루씩 밀린다
  → `timezoneId: "Asia/Seoul"`
- 레이아웃이 `max-w-md` 모바일 전용이다 → `devices["Pixel 7"]`

### (8) 눈에 안 보이는 문자

- 휴식 바의 `−30초` 는 ASCII 하이픈이 아니라 **U+2212 MINUS SIGN**
- 로딩 문구 `불러오는 중…` 의 점 셋은 **U+2026 HORIZONTAL ELLIPSIS**
- 세션 화면 세트 줄의 `60kg × 11` 은 곱셈 기호(U+00D7) 양옆에 공백이 있고,
  통계 화면의 `60kg×10` 은 공백이 없다

복사해서 붙여넣는 게 안전하다.

### (9) 첫 페인트는 항상 "불러오는 중…"

`useLiveQuery`는 첫 렌더에서 `undefined`를 준다. 그래서 모든 화면이 로딩 문구로 시작한다.
`expect(...).toBeVisible()` 은 자동으로 재시도하므로 **실제 내용을 단언하면 된다.**
"로딩이 사라졌는지"를 단언하는 건 불필요하고 깨지기 쉽다.

### (10) 숫자 단언은 소스의 포맷 함수를 먼저 확인한다

68분짜리 세션의 헤더를 `"68분"` 으로 단언했다가 틀렸다.
`formatDurationMs`는 60분을 넘으면 `"1시간 8분"` 으로 적는다.
이 앱의 포맷 규칙은 [src/lib/format/date.ts](../src/lib/format/date.ts)와
[src/lib/stats/volume.ts](../src/lib/stats/volume.ts)에 모여 있고,
기대 문자열의 실례는 [scripts/smoke.ts](../scripts/smoke.ts)에 이미 검증되어 있다.

---

## 6. 셀렉터 전략

이 앱에는 `data-testid`가 **하나도 없다.** 그래도 대부분 잡힌다. 튼튼한 순서대로:

1. **`aria-label`** — 가장 안정적이다
   `뒤로`, `닫기`, `휴식 종료`, `종목 빼기`, `이전 달`/`다음 달`,
   `무게 증가`/`무게 감소`, `{종목명} 수정|삭제|통계`
2. **역할 + 정확한 텍스트** — `getByRole("button", { name: "운동 시작", exact: true })`
3. **`role="dialog"` + 시트 제목** — `getByRole("dialog", { name: "종목 추가" })`.
   화면의 버튼과 시트 제목이 같은 글자일 때 범위를 좁히는 데 필수다
4. **`role="switch"` + 라벨** — 설정의 토글들
5. **`getByPlaceholder`** — `종목 검색`
6. **`getByLabel`** — `<label>`이 감싼 경우에만 (내보내기의 `시작`/`끝` 날짜 칸)
7. **`role="img"` + `aria-label`** — 차트. SVG 좌표를 검사하는 대신
   `총 볼륨 (kg)` / `총 횟수 (회)` 패널이 그려졌는지만 보고,
   값은 같은 숫자를 글자로도 보여주는 "날짜별" 목록에서 단언한다

### 지금 `data-testid`를 넣는다면 여기

굳이 넣는다면 아래 정도다. 다만 **접근성 속성을 고치는 쪽이 대체로 낫다** —
테스트도 되고 실제 사용자에게도 이득이기 때문이다.

| 위치 | 현재 문제 | 권장 |
|---|---|---|
| `Stepper`의 숫자 `<input>` | 접근성 이름이 없다 (`<label>`에 `htmlFor` 없음) | `htmlFor`/`id` 연결 또는 `aria-label` |
| 종목 행 버튼 | 이름에 부제가 섞여 길고 서로 포함 관계 | 이름 부분을 `aria-label`로 따로 주기 |
| `RestTimerBar`의 시계 | 숫자만 있어 다른 시계와 구분 안 됨 | `aria-label="남은 휴식"` |
| 통계 요약 줄 | 긴 한 줄이라 부분 단언만 가능 | 필요해지면 `data-testid="stats-summary"` |

---

## 7. 부록 — 다음 단계: Playwright Agents

Playwright는 공식 에이전트 정의 3종을 제공한다.

```bash
npx playwright init-agents --loop=claude
```

- **Planner** — 실행 중인 앱을 돌아다니며 "무엇을 테스트해야 하는가"를 마크다운 계획서로 쓴다
- **Generator** — 그 계획서를 실행 가능한 테스트 파일로 바꾼다.
  쓰면서 실제로 브라우저를 몰아보기 때문에, 내놓는 로케이터는 방금 성공시킨 것들이다
- **Healer** — 깨진 테스트 이름을 받아 실패를 재현하고, 현재 UI에서 대응 요소를 찾아 고친 뒤 다시 돌린다

이 문서에서 손으로 한 작업(탐색 → 코드화)을 자동화한 것에 가깝다.
**먼저 손으로 한 번 해보고 나서** 쓰는 것을 권한다. Healer가 내놓는 수정이 옳은지
판단하려면 결국 위의 함정들을 알고 있어야 하기 때문이다.
