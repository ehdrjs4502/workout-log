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
- generic [ref=e2]:
  - banner [ref=e3]:
    - paragraph [ref=e4]: 2026-09-16 (수)
    - heading "운동 기록" [level=1] [ref=e5]
  - main [ref=e6]:
    - button "운동 시작" [ref=e48]
    - generic [ref=e8]:
      - heading "최근 기록" [level=2] [ref=e9]
      - paragraph [ref=e59]: 아직 기록이 없습니다
  - navigation [ref=e12]:
    - list [ref=e13]:
      - listitem [ref=e14]:
        - link "오늘" [ref=e15] [cursor=pointer]:
          - /url: /
```

(위는 실제로 받은 트리를 줄인 것이다. 4절에 원본이 있다.)

트리를 처음 보면 헷갈리는 표기가 둘 있다:

- **`[active]`는 '현재 탭'이 아니라 `document.activeElement`다.** 즉 포커스 표시다.
  버튼을 누른 직후 스냅샷을 찍으면 그 버튼에 `[active]`가 붙어 있다.
- **`aria-current="page"`는 트리에 나오지 않는다.** `BottomNav`는 현재 탭에
  `aria-current="page"`를 붙이지만([src/components/BottomNav.tsx:40](../src/components/BottomNav.tsx#L40))
  스냅샷에는 흔적이 없다. "지금 어느 탭인가"는 스냅샷으로 알 수 없고,
  `toHaveAttribute("aria-current", "page")`로 단언해야 한다 — `nav.spec.ts`가 그렇게 하고 있다.

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

아래는 블로그 요약이 아니라 **이 프로젝트 설정으로 서버를 띄워 `tools/list`를 직접 받아본 결과**다
(`@playwright/mcp@0.0.81`, Playwright 1.64.0-alpha).
기본 26개 + `--caps=testing`이 더해주는 5개 = **31개**.

| 분류 | 도구 | 쓰는 때 |
|---|---|---|
| 이동 | `browser_navigate`, `browser_navigate_back`, `browser_tabs` | URL 열기, 뒤로, 탭 전환 |
| | `browser_close`, `browser_resize` | 닫기, 뷰포트 크기 변경 |
| 관찰 | `browser_snapshot` | **가장 많이 쓴다.** 현재 화면의 접근성 트리 |
| | `browser_find` | 큰 페이지에서 텍스트/정규식으로 요소 찾기 |
| | `browser_take_screenshot` | 눈으로 봐야 할 때만 (레이아웃 깨짐 등) |
| 조작 | `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option` | ref를 받아 동작 |
| | `browser_press_key`, `browser_hover`, `browser_drag`, `browser_drop` | |
| | `browser_file_upload` | 파일 선택 (설정의 '가져오기' 같은 흐름) |
| 다이얼로그 | `browser_handle_dialog` | **이 앱에 꼭 필요하다.** 네이티브 `confirm`/`alert` 수락·취소 |
| 대기 | `browser_wait_for` | 텍스트가 나타나거나 사라질 때까지, 또는 정해진 시간 |
| 실행 | `browser_evaluate` | 페이지 안에서 JS 실행 — **이 앱에선 IndexedDB 조작에 쓴다** |
| | `browser_run_code_unsafe` | Playwright 코드 조각을 통째로 실행 (이름 그대로 위험) |
| 진단 | `browser_console_messages` | 콘솔 메시지 전부 |
| | `browser_network_requests`, `browser_network_request` | 요청 목록 / 한 건의 헤더·본문 |
| 페이지 도구 | `browser_webmcp_list`, `browser_webmcp_call` | 페이지가 직접 등록한 WebMCP 도구 (이 앱은 안 쓴다) |
| **`--caps=testing`** | `browser_generate_locator` | **MCP → spec 코드 변환의 핵심.** 요소의 권장 로케이터를 뽑는다 |
| | `browser_verify_element_visible`, `browser_verify_text_visible` | 단언을 도구로 표현 |
| | `browser_verify_list_visible`, `browser_verify_value` | 목록/입력값 단언 |

직접 확인한 것 두 가지:

- **스토리지 전용 도구는 없다.** `browser_localstorage_set` / `browser_cookie_set` /
  `browser_storage_state` 같은 이름을 소개하는 글이 많지만 이 버전에는 존재하지 않는다.
  쿠키·localStorage·IndexedDB는 전부 `browser_evaluate`로 다룬다.
- `--caps=vision,pdf,devtools`를 켜면 20개가 더 붙는다 — 좌표 기반 마우스
  (`browser_mouse_click_xy` 등), `browser_pdf_save`, 트레이싱·녹화
  (`browser_start_tracing`, `browser_start_video`, `browser_highlight` …).
  접근성 트리로 충분한 이 앱에서는 좌표 도구가 오히려 테스트를 깨지기 쉽게 만든다.

> 설정을 바꿨을 때 도구 목록이 실제로 어떻게 변하는지는 서버에 직접 물어보면 된다.
> `npx @playwright/mcp@latest --isolated --caps=testing` 를 stdio로 띄우고
> `initialize` → `tools/list` JSON-RPC 두 줄을 보내면 위 표가 그대로 나온다.

### 한 턴의 실제 흐름

"운동을 시작하고 벤치프레스를 추가해줘" 한 마디는 대략 이렇게 풀린다:

```
browser_navigate(url="http://localhost:3000")
  → 스냅샷: button "운동 시작" [ref=e48]
browser_click(element="운동 시작 버튼", target="e48")
  → 스냅샷: URL이 /session/… 으로 바뀜, button "종목 추가" [ref=e94]
browser_click(element="종목 추가 버튼", target="e94")
  → 스냅샷: dialog "종목 추가" 안에 searchbox [ref=e109]
browser_type(element="종목 검색", target="e109", text="벤치프레스")
  → 스냅샷: button "벤치프레스 가슴 · 바벨 · 휴식 180초" [ref=e135]
browser_click(element="벤치프레스 행", target="e135")
```

위 ref 번호는 4절 실습에서 실제로 받은 값이다.

두 가지를 짚어둔다:

- **인자 이름은 `ref`가 아니라 `target`이다.** 스냅샷은 `[ref=e135]`로 출력하면서
  도구는 `target="e135"`로 받는다. 문서를 먼저 읽으면 반드시 한 번 틀리는 자리다.
  `target`은 ref 대신 CSS 셀렉터도 받는다.
- **`element`(사람이 읽는 설명)는 생략할 수 있지만 쓰는 게 좋다.** 승인 프롬프트와
  로그에 그대로 나온다. 나중에 대화 기록을 다시 읽을 때 "e135가 뭐였지"를 안 찾아도 된다.

`ref`의 수명은 **그 DOM 노드의 수명**이다. "스냅샷마다 새로 받아야 하는 일회용 번호"가
아니고, 재렌더가 일어나도 노드가 살아있으면 같은 번호를 유지한다 (4절에 실측이 있다).
그래도 언제 죽는지를 예측하려 들지 말고 `동작 → 관찰 → 동작`을 지키는 편이 싸다.
죽은 ref를 써도 무슴 사고가 나는 것도 아니고, 즉시 에러가 난다.

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

## 4. 실습 로그 — MCP로 직접 몰아본 기록

2026-09-16, `pnpm dev`(Next 16.3.4 Turbopack)를 띄우고 **`browser_*` 도구만으로**
운동 시작 → 벤치프레스 추가 → 2세트 → 종료까지 한 바퀴 돌렸다.
`pnpm test:e2e`는 한 번도 돌리지 않았다.

첫 줄은 뷰포트부터. MCP 브라우저는 기본이 데스크톱이라
`playwright.config.ts`의 `devices["Pixel 7"]`과 맞춰줘야 같은 화면을 본다:

```
browser_resize(width=412, height=915)
```

### (1) 스냅샷이 대화에 안 올 수도 있다

시작하자마자 예상과 달랐던 점. `browser_navigate` 결과가 이렇게 왔다:

```
### Page
- Page URL: http://localhost:3000/
- Page Title: 운동 기록
### Snapshot
- [Snapshot](.playwright-mcp\page-2026-09-16T13-11-20-328Z.yml)
### Events
- New console entries: .playwright-mcp\console-2026-09-16T13-11-20-011Z.log#L1-L2
```

트리가 아니라 **파일 경로**다. 규칙은 이렇다:

- `browser_navigate` / `browser_click` 같은 **동작** 도구가 덧붙여 주는 스냅샷 → `.playwright-mcp/`에 파일로 저장
- `browser_snapshot`을 명시적으로 부르면 → 결과가 그대로 인라인으로 온다

그래서 실습 내내 "클릭 → `cat`으로 파일 읽기"를 반복하거나,
큰 페이지에서는 `browser_find`로 필요한 조각만 도려내는 편이 훨씬 편했다.
다행히 `.playwright-mcp/`는 이미 `.gitignore`에 들어 있다.

### (2) 첫 페인트의 "불러오는 중…"을 실제로 잡았다

7절(9)에 적어둔 것이 바로 눈에 보였다. 첫 스냅샷 전문이다:

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - paragraph [ref=e4]: 2026-09-16 (수)
    - heading "운동 기록" [level=1] [ref=e5]
  - main [ref=e6]:
    - generic [ref=e7]: 불러오는 중…
    - generic [ref=e8]:
      - heading "최근 기록" [level=2] [ref=e9]
      - generic [ref=e10]: 불러오는 중…
  - navigation [ref=e12]:
    - list [ref=e13]:
      - listitem [ref=e14]:
        - link "오늘" [ref=e15] [cursor=pointer]:
          - /url: /
```

`main` 안이 통째로 로딩 문구다. `운동 시작` 버튼은 아직 없다.

**어떻게 넘겼는가: 그냥 `browser_snapshot`을 한 번 더 찍었다.**
`browser_wait_for(textGone="불러오는 중…")`을 쓸 생각이었는데 필요가 없었다 —
다음 도구 호출까지의 왕복 시간이 이미 로딩보다 길었다.
7절(9)의 "로딩이 사라졌는지를 단언하지 말라"는 MCP에서도 그대로 통한다.

두 번째 스냅샷에서야 본 것들:

```yaml
    - main [ref=e6]:
      - generic [ref=e41]:
        - button "닫기" [ref=e42]
        - paragraph [ref=e46]: 홈 화면에 추가해 주세요
        - paragraph [ref=e47]: 설치하면 오프라인에서도 열리고, 휴식 알림을 받을 수 있습니다.
      - button "운동 시작" [ref=e48]
      ...
  - button "Open Next.js Dev Tools" [ref=e66] [cursor=pointer]
  - alert [ref=e70]
```

spec에서는 몰랐던 것 세 개가 드러난다:

- **PWA 설치 배너가 떠 있다.** `fixtures.ts`가 `localStorage.clear()`로 지워서
  spec 쪽에선 보이지 않던 것이다. MCP에는 그 픽스처가 없으니 그대로 나온다.
- **`alert [ref=e70]`** — Next의 라우트 어나운서(route announcer)다. 화면을 옮기면
  여기에 `운동`, `운동 기록` 같은 페이지 제목이 들어간다.
  `getByRole("alert")`나 넓은 `getByText`를 쓰면 여기 걸릴 수 있다.
- **`button "Open Next.js Dev Tools"`** — 7절(4)의 `<nextjs-portal>`이다. 아래 (9) 참고.

### (3) 종목 추가 시트는 274줄짜리 트리다

시트를 열었더니 스냅샷 파일이 274줄이 됐다. 프리셋 44개가 전부 들어 있기 때문이다
(`grep -c`로 세어보니 정확히 44). 행 하나의 구조:

```yaml
- listitem [ref=e134]:
  - button "벤치프레스 가슴 · 바벨 · 휴식 180초" [ref=e135]:
    - generic [ref=e137]:
      - generic [ref=e138]: 벤치프레스
      - generic [ref=e139]: 가슴 · 바벨 · 휴식 180초
```

7절(2)가 말하는 것이 그대로 보인다 — 자식 `generic` 둘의 텍스트가 합쳐져
버튼 하나의 이름이 된다. 그리고 `벤치프레스`로 검색했더니 세 형제가 남는다:

```
- button "덤벨 벤치프레스 가슴 · 덤벨 · 휴식 150초" [ref=e123]
- button "벤치프레스 가슴 · 바벨 · 휴식 180초" [ref=e135]
- button "인클라인 벤치프레스 가슴 · 바벨 · 휴식 180초" [ref=e147]
```

7절(1)의 함정을 코드를 돌려보기 전에 **눈으로 먼저 확인할 수 있다는 게 핵심이다.**
strict mode 에러를 세 번 맞고 깨닫는 대신, 스냅샷 한 번이면 된다.

문서에 없던 걸 하나 더 발견했다 — **시트에 `닫기` 버튼이 두 개다:**

```yaml
- generic [ref=e96]:
  - button "닫기" [ref=e97]        # 백드롭(overlay)
  - dialog "종목 추가" [ref=e98]:
    - generic [ref=e99]:
      - heading "종목 추가" [level=2] [ref=e100]
      - button "닫기" [ref=e101]    # 헤더의 X
```

`page.getByRole("button", { name: "닫기" })`는 strict mode violation이 난다.
`dialog`로 범위를 좁혀야 한다 — 8절 셀렉터 전략 3번이 여기서도 답이다.

### (4) `ref`는 언제 무효해지는가 — 일부러 두 번 해봤다

이번 실습에서 가장 예상과 달랐던 부분이다.

**실험 1 — 사라진 노드의 ref.** 첫 스냅샷의 `불러오는 중…`(`e7`)은 로드 후 사라졌다:

```
browser_click(element="첫 스냅샷의 불러오는 중… 노드", target="e7")
→ Error: Ref e7 not found in the current page snapshot. Try capturing new snapshot.
```

**실험 2 — 교체된 노드의 ref.** 1세트를 완료하면 `button "1세트 완료" [ref=e444]`가
`button "2세트 완료" [ref=e453]`로 바뀐다. 같은 자리, 같은 역할, 새 번호다.
옛 번호로 클릭하면:

```
browser_click(element="옛 '1세트 완료' 버튼", target="e444")
→ Error: Ref e444 not found in the current page snapshot. Try capturing new snapshot.
```

중요한 건 **즉시 실패한다는 점**이다. 엉뚱한 걸 누르거나 30초를 기다리지 않는다.
메시지도 해야 할 일을 그대로 알려준다 — 새 스냅샷을 찍어라.

**그런데 반대로, ref는 생각보다 오래 산다.** 2절에 "그 스냅샷 시점에만 유효한
임시 핸들"이라고 적어두었는데, 실측은 달랐다:

| 무슨 일이 있었나 | ref |
|---|---|
| 검색어 입력으로 목록을 44개 → 3개로 필터링 | `e135` **그대로** |
| 휴식 타이머 텍스트가 `3:00` → `2:44`로 바뀜 | `e458` **그대로** |
| `1세트 완료` → `2세트 완료` (노드 교체) | `e444` → `e453` |
| 세트 하나 더 기록 (휴식 바 전체 리마운트) | `e455~e461` → `e478~e484` |
| `/session/…` → `/` 라우트 이동 | 홈 화면 전체가 새 번호 (`e488+`) |

즉 **ref는 스냅샷이 아니라 DOM 노드에 매달려 있다.**
React가 리렌더만 했으면 살아있고, 노드를 지우고 다시 만들었으면 죽는다.
그래도 어느 쪽인지 예측하려 들 이유가 없으니, 그냥 매번 새로 받는 게 맞다.

한 가지 더: **페이지를 다시 로드하고 나니 ref 형식 자체가 `e39`에서 `f1e39`로 바뀌었다.**
프레임 접두사다. ref 문자열을 손으로 조립하거나 규칙을 가정하면 안 된다는 뜻이다.

### (5) `browser_handle_dialog` — 문서를 고쳐야 했다

7절(3)에 "스냅샷이 멈춘 것처럼 보이면 다이얼로그가 떠 있는 것"이라고 썼는데,
**틀렸다.** MCP는 전혀 조용하지 않다. `종료`를 누르자마자:

```
### Modal state
- ["confirm" dialog with message "운동을 종료할까요?"]: can be handled by browser_handle_dialog
```

그리고 다이얼로그를 치우기 전까지 **다른 도구가 전부 막힌다.**
그냥 스냅샷을 찍어보면:

```
Error: Tool "browser_snapshot" does not handle the modal state.
### Modal state
- ["confirm" dialog with message "운동을 종료할까요?"]: can be handled by browser_handle_dialog
```

이건 `@playwright/test`와 **정반대 설계**다:

| | `@playwright/test` | Playwright MCP |
|---|---|---|
| 핸들러가 없을 때 | 조용히 **dismiss**, 테스트만 이유 없이 실패 | **마무리할 때까지 멈춰 서서 명시적으로 알림** |
| 고치는 법 | `page.on("dialog", d => d.accept())`를 **미리** 걸어두기 | `browser_handle_dialog(accept=true)`를 **나중에** 부르기 |

정리하면: **다이얼로그에 관한 한 MCP가 훨씬 친절하다.**
spec에서는 미리 알고 핸들러를 걸지 않으면 조용히 지나가지만, MCP는 모를 수가 없다.
오히려 **MCP로 먼저 몰아보면 "여기 confirm이 있다"를 공짜로 알게 된다.**
그 다음에 `fixtures.ts`의 `dialogs` 픽스처를 쓰면 된다.

`accept=true` 후에는 그냥 홈으로 넘어갔고, 최근 기록에 쌓였다:

```yaml
- link "9월 16일 (수) 벤치프레스 2세트 · 2분 · 1,320kg" [ref=e505] [cursor=pointer]:
    - /url: /session/bd7d218d-df45-4762-b090-f7b01766f9c6
```

### (6) 콘솔은 깨끗했다

전체 플로우를 돌린 뒤 `browser_console_messages(all=true)`:

```
Total messages: 2 (Errors: 0, Warnings: 0)

[INFO] %cDownload the React DevTools for a better development experience: …
[LOG] [HMR] connected
```

둘 다 Next dev 서버가 내는 소음이다. 앞에 붙는 `[    256ms]` 같은
상대 타임스탬프가 있어서 "어느 동작 뒤에 찍혔는지"를 맞추기 좋다.

안 나온 것도 의미가 있다: **hydration mismatch 경고가 없고, 서비스워커 등록 로그도 없다.**
나중에 페이지를 새로고침했을 때만 폰트 preload 경고 둘이 붙었는데, 무해하다:

```
[WARNING] The resource ….woff2 was preloaded using link preload but not used
          within a few seconds from the window's load event.
```

### (7) `browser_generate_locator` vs 손으로 쓴 것

실습의 하이라이트. 주요 요소에 대해 도구가 내놓은 로케이터를
[e2e/session.spec.ts](../e2e/session.spec.ts)와 나란히 놓으면 이렇다.

| 요소 | `browser_generate_locator` | 손으로 쓴 것 | 판정 |
|---|---|---|---|
| 종목 추가 시트 | `getByRole('dialog', { name: '종목 추가' })` | 같음 | — |
| 휴식 −30초 | `getByRole('button', { name: '−30초' })` | 같음 | — |
| 운동 시작 | `getByRole('button', { name: '운동 시작' })` | 같음 | — |
| 종료(헤더) | `getByRole('button', { name: '종료', exact: true })` | 같음 | **도구가 알아서 `exact`를 붙였다** |
| 종목 검색 | `getByRole('searchbox', { name: '종목 검색' })` | `getByPlaceholder("종목 검색")` | 도구 쪽이 약간 낫다 |
| 벤치프레스 행 | `getByRole('button', { name: '벤치프레스 가슴 · 바벨 · 휴식 180초', exact: true })` | `getByRole("button", { name: /^벤치프레스 / })` | **손으로 쓴 쪽이 낫다** |
| 세트 완료 | `getByRole('button', { name: '세트 완료' })` | `getByRole("button", { name: "1세트 완료" })` | **도구 쪽이 낫다** |
| 무게 입력 칸 | `getByRole('textbox').first()` | (안 쓰고 ± 버튼을 썼다) | **둘 다 나쁘다** |
| 최근 기록 링크 | `getByRole('link', { name: '월 16일 (수) 벤치프레스 2세트 · 2분 · 1,320kg' })` | (없음) | **도구가 이상하다** |

하나씩 보면:

**도구가 이긴 자리 — `세트 완료`.**
내가 쓴 `name: "1세트 완료"`는 세트 번호가 바뀔 때마다 문자열을 고쳐써야 한다.
도구는 앞의 숫자를 떼고 `'세트 완료'`만 남겨서, 1세트든 5세트든 그대로 잡힌다.
`getByRole`의 name이 기본적으로 부분 일치라는 성질을 **함정이 아니라 도구로** 쓴 예다.
7절(1)이 "부분 일치는 위험하다"만 말하고 있었는데, 반대쪽 쓸모도 있었던 것이다.

**내가 이긴 자리 — 벤치프레스 행.**
도구는 부제를 통째로 적고 `exact: true`를 붙였다. 동작은 하지만
**프리셋의 기본 휴식 시간을 180초에서 바꾸는 순간 깨진다.**
내 `/^벤치프레스 /`는 변하지 않는 부분만 고정하고 형제들과도 안 섞인다.
도구는 **지금 DOM에서 유일한가**만 보지, **내일도 유효할까**는 보지 않는다.

**도구가 아예 이상한 자리 — 최근 기록 링크.**
`'월 16일 (수) …'` — 앞의 `9`를 일부러 떨궈 놓았다. 이유는 모르겠고,
어차피 날짜가 들어간 문자열이라 스펙에 그대로 옮길 수 없다.
**도구 출력은 초안이지 정답이 아니다.**

**둘 다 나쁜 자리 — `Stepper`의 숫자 칸.**
`getByRole('textbox').first()`. 1절과 8절에서 "접근성 이름이 없다"고 쓴 것의
가장 직접적인 증거다. 도구도 더 나은 걸 못 만들어서 `.first()`로 도망쳤다.
순서 하나 바뀌면 그대로 깨진다. **8절의 `aria-label` 권장이 그냥 이론이 아니라는 뿌리다.**

하나 더. **도구를 따로 부르지 않아도 로케이터가 공짜로 나온다.**
모든 동작 도구가 자기가 실행한 Playwright 코드를 돌려준다:

```
### Ran Playwright code
await page.getByRole('button', { name: '종료', exact: true }).click();
```

이것만 모아도 spec 초안이 된다. 3절의 "MCP는 손, spec은 기억"이 이런 모양이다.

그리고 사소하지만 유용한 것 하나 — 7절(8)의 **눈에 안 보이는 문자** 문제가
여기서 저절로 해결된다. `'−30초'`의 첫 글자를 코드포인트로 찍어보면 `0x2212`다.
추측해서 입력하지 말고 **도구 출력을 복사해서 붙여넣으면 된다.**

### (8) 보너스 — IndexedDB를 지우고 프리셋이 다시 심기는 것 보기

먼저 지우기 전 상태를 `browser_evaluate`로 확인했다:

```json
{
  "databases": [
    { "name": "__next_debug_channel", "version": 1 },
    { "name": "workout-log", "version": 30 }
  ],
  "stores": ["exercises", "restTimer", "sessionExercises", "sessions", "setLogs", "settings"],
  "counts": { "exercises": 44, "restTimer": 0, "sessionExercises": 1,
              "sessions": 1, "setLogs": 2, "settings": 1 }
}
```

방금 기록한 세션 1개와 세트 2개가 그대로 들어 있다.
(곁다리로 `__next_debug_channel`은 Next 16 dev가 만드는 것이다. 우리 건 아니다.)

**그러고 나서 문서가 틀렸다는 걸 알았다.**
6절에 "`goto` 후에 지우려 하면 Dexie가 이미 커넥션을 잡고 있어 삭제가 `blocked` 된다"고
썼는데, 앱이 띄워진 상태에서 `onblocked`를 달고 지워봤더니:

```json
{ "blocked": false, "log": ["success"] }
```

거기에 콘솔 경고가 하나 찍혔는데, 이게 이유를 그대로 말해준다:

```
[WARNING] Another connection wants to delete database 'workout-log'.
          Closing db now to resume the delete request.
```

**Dexie가 `versionchange` 이벤트를 듣고 자기 커넥션을 스스로 닫아준다.**
그래서 막히기는커녕 즉시 지워졌고, `indexedDB.databases()`에서도 바로 사라졌다.
6절 본문은 고쳐두었다 — `addInitScript`를 써야 하는 진짜 이유는 따로 있다.

이제 `browser_navigate`로 새로고침하고 다시 세어보면:

```json
{
  "version": 30,
  "exercises": 44,
  "sessions": 0,
  "setLogs": 0,
  "first5": ["티바로우", "레그 익스텐션", "덤벨 숄더프레스", "아놀드 프레스", "행잉 레그레이즈"]
}
```

스토어 6개가 다시 생기고, 버전은 그대로 30, **프리셋 44개가 돌아왔고**,
기록은 0이다. Dexie의 `populate` 훅이 제대로 돌았다는 뜻이다.
(`first5`가 카테고리 순서가 아닌 것은 `getAll()`이 기본 인덱스 순서로 주기 때문이다.)

화면으로도 확인했다. 하단 네비의 `종목` 탭을 누르니 헤더가 그냥 이렇게 말해준다:

```yaml
- banner [ref=f1e71]:
  - generic [ref=f1e72]:
    - heading "종목" [level=1] [ref=f1e73]
    - paragraph [ref=f1e74]: 44개
```

### (9) 재현되지 않은 것 — `<nextjs-portal>` 클릭 가로채기

7절(4)에 412px 폭에서 `<nextjs-portal>`이 하단 네비를 덮어 클릭을 가로채고
30초를 버티다 죽었다고 적혀 있다. 그러나 **이번 실습에선 재현되지 않았다.**
같은 412×915에서 `종목` 탭을 바로 눌렀고 그냥 이동했다. MCP 쪽에는
`fixtures.ts`의 `nextjs-portal{display:none}` 같은 장치가 없는데도 그랬다.

스냅샷에는 `button "Open Next.js Dev Tools" [ref=e66]`로 잔존한다.
Next 16.3.4에서 오버레이 위치가 바뀐 것으로 보인다.
픽스처의 방어를 걷어낼 이유는 없다 — 공짜고, 버전이 올라가면 다시 걸릴 수 있다.
다만 **그 항목은 "이 버전에선 항상 그렇다"가 아니라는 것을 알고 읽어야 한다.**

### (10) 덤으로 — spec의 휴식 타이머 단언은 사실 위태롭다

손으로 몰면서만 보이는 것이 있었다. 휴식 바를 관찰한 순서는 이렇다:

```
1세트 완료 직후        →  3:00
6초 기다린 뒤          →  2:44   (실제 벽시계대로 준다)
−30초 버튼 클릭 뒤     →  2:02
```

`session.spec.ts`는 `3:00`을 단언하고 `−30초`를 누른 뒤 `2:30`을 단언한다.
지금 통과하는 이유는 단지 **두 줄이 1초 안에 끝나기 때문**이다.
CI가 느리거나 경계를 스치면 `2:29`가 나와서 깨진다. 잠재적인 flake다.

게다가 `session.spec.ts` 머릿말 주석에는 "가짜 시계까지 등장한다"고 적혀 있는데
`e2e/` 어디에도 `page.clock` 같은 건 없다. 주석은 고쳐두었다.
제대로 고치려면 [`page.clock`](https://playwright.dev/docs/clock)을 도입해
시간을 고정하는 게 맞고, 그건 다음 숙제다.

### (11) 정리 — 예상과 달랐던 것

| 예상 | 실제 |
|---|---|
| 스냅샷은 항상 대화에 YAML로 온다 | 동작 도구의 스냅샷은 `.playwright-mcp/`에 파일로 떨어진다 |
| 인자 이름은 `ref` | `target`이다 (ref 문자열 또는 CSS 셀렉터) |
| ref는 스냅샷마다 무효해진다 | DOM 노드가 살아있으면 유지된다 |
| 다이얼로그가 뜨면 흐름이 멈춰 보인다 | `Modal state`로 명시하고 다른 도구를 모두 막는다 |
| 앱이 뜬 상태에서 `deleteDatabase`는 `blocked` | Dexie가 양보해서 그냥 성공한다 |
| `<nextjs-portal>`이 클릭을 가로챈다 | 이 버전에선 안 그렇다 |
| 손으로 쓴 로케이터가 더 낫다 | 절반만. `세트 완료`는 도구가 이겼다 |

가장 큰 수확은 따로 있다. **MCP로 한 번 몰아보면 7절의 함정 절반은 애초에 안 밟는다.**
벤치프레스 세 형제도, `닫기` 버튼 두 개도, `종료`/`휴식 종료` 충돌도
스냅샷과 `browser_generate_locator`가 먼저 알려준다.
strict mode 에러를 세 번 맞아가며 배우는 것도 방법이지만, 더 싼 길이 있었다.

---

## 5. MCP 자체에 대해 배운 것 — 그리고 아직 모르는 것

4절은 읽어보면 대부분 Playwright 얘기고 이 앱 얘기다. MCP라는 **규약**에 대한 건 적다.
한 발 물러나서 정리해 둔다. 먼저 솔직하게:

> 이번 실습은 엄밀히 말해 "MCP 공부"가 아니라 **MCP 서버 하나를 소비자로 써본 것**이다.
> 그래도 남의 잘 만든 서버를 반나절 몰아보는 건 스펙 문서를 읽는 것보다 많이 가르쳐 준다.

### (1) 좋은 MCP 서버는 에이전트의 실수를 설계에 포함한다

이번에 가장 크게 배운 것. 도구가 31개라는 사실보다, **모델이 헛발질했을 때 서버가 뭘 하는가**가
훨씬 중요하다. 4절에서 우연히 세 가지 경우를 다 밟았다.

| 상황 | 흔한 설계 | Playwright MCP가 한 것 |
|---|---|---|
| 죽은 `ref`로 클릭 | 실패, 또는 엉뚱한 요소를 클릭 | `Ref e444 not found… **Try capturing new snapshot**` |
| 다이얼로그가 뜬 채 다른 도구 호출 | 조용히 무시하거나 타임아웃 | 거부하면서 **`browser_handle_dialog`로 풀 수 있다**고 알려줌 |
| 스냅샷이 274줄 | 대화에 통째로 쏟아붓기 | `.playwright-mcp/*.yml` 파일로 흘리고 경로만 반환 |

셋의 공통점이 핵심이다. **사람이 읽을 에러가 아니라, 에이전트가 자력으로 복구하도록 쓰인 에러다.**

- 원인만 말하지 않고 **다음 행동을 지시한다** ("새 스냅샷을 찍어라")
- 막을 때 **어느 도구가 그 상태를 푸는지 이름을 준다**
- 잘못된 상태로 흘러가기 전에 **먼저 멈춰 세운다** (dismiss 해버리고 지나가지 않는다)

마지막 줄은 7절(3)에서 본 `@playwright/test`의 기본 동작과 정반대다.
테스트 러너는 사람이 나중에 로그를 읽는다고 가정하고, MCP 서버는 모델이 지금 읽고
바로 다음 수를 둔다고 가정한다. **같은 Playwright 위에 얹혔는데 설계 철학이 다르다.**

세 번째 항목(파일로 흘리기)도 그냥 편의가 아니다.
**컨텍스트 예산 관리가 서버 쪽 책임이라는 뜻**이다. 내가 나중에 MCP 서버를 짠다면
"결과가 크면 어떻게 할 것인가"를 도구마다 정해야 한다는 것.

### (2) 서버가 상태를 쥐고, 모델은 핸들만 받는다

`ref` / `target`이 MCP의 전형적인 패턴이다.

```
서버: Playwright ElementHandle, BrowserContext, 페이지 수명 ... 전부 서버가 소유
모델: "e135" 라는 불투명한 문자열 하나
```

모델은 실제 객체를 절대 만지지 못한다. 파일 디스크립터든 DB 커넥션이든
MCP 서버는 대개 이렇게 생겼을 것이다 — **자원은 서버가, 핸들은 모델이.**

여기서 얻은 실전 교훈: **핸들의 수명 규칙은 스펙에 안 적혀 있다.**
"스냅샷마다 무효해진다"고 짐작했지만 실제로는 DOM 노드 수명에 매달려 있었고,
리로드 후엔 접두사까지 `f1e39`로 바뀌었다 (4절(4)). 문서에 없으면 **찔러봐야 안다.**

### (3) 스키마가 유일한 진실이다

실습 시작하자마자 걸린 것. 도구 인자가 `ref`인 줄 알고 2절에 그렇게 써놨는데
실제 스키마는 `target`이었다.

블로그도, 내가 쓴 문서도 틀릴 수 있다. **`tools/list`가 돌려주는 스키마만 맞다.**
2절에서 도구 31개를 서버에 직접 물어본 방식이 옳았던 것이고,
같은 태도를 인자 이름에도 적용했어야 했다.

### (4) 도구 표면적은 공짜가 아니다

`--caps=testing`으로 31개. 여기에 `--caps=vision,pdf,devtools`를 더 켜면 20개가 붙는다.
**도구 설명은 전부 컨텍스트에 들어간다.** 안 쓸 도구를 켜 두는 건 매 턴 비용이다.

그래서 `.mcp.json`의 `--caps` 선택은 취향이 아니라 **예산 결정**이다.
이 앱은 접근성 트리로 충분하니 `vision`(좌표 기반 마우스)은 켤 이유가 없고,
켜면 오히려 모델이 좌표 클릭이라는 더 나쁜 선택지를 갖게 된다.
**도구를 빼는 것도 서버 설계다.**

### (5) 이번에 안 배운 것 — MCP는 tools 말고도 있다

여기가 중요하다. Playwright MCP를 쓰면서 내가 만진 건 **전부 `tools`였다.**
그런데 MCP가 정의하는 primitive는 그것 하나가 아니다.

| primitive | 무엇인가 | 이번에 썼나 |
|---|---|---|
| **Tools** | 모델이 호출하는 동작 (`browser_click` …) | ✓ 이것만 썼다 |
| **Resources** | 서버가 노출하는 읽을거리. URI로 식별한다 | ✗ |
| **Prompts** | 서버가 제공하는 프롬프트 템플릿 (슬래시 커맨드로 노출되곤 한다) | ✗ |
| **Sampling** | 서버가 **거꾸로** 모델에게 완성을 요청하는 것 | ✗ |
| **Roots** | 클라이언트가 서버에게 작업 범위(디렉터리)를 알려주는 것 | ✗ |

그러니 4절에 붙인 "실습 로그"는 정확히는 **"MCP tools 실습 로그"**다.
`.mcp.json` 한 줄로 서버를 붙이고 도구를 호출해 본 것까지가 이번 범위였다.

이 서버가 tools 외에 뭘 더 노출하는지는 아직 확인 안 했다.
확인하는 방법은 2절에서 도구 목록을 받아본 것과 똑같다 — stdio로 띄우고
`tools/list` 대신 `resources/list`, `prompts/list`를 물어보면 된다.
(WebMCP 도구인 `browser_webmcp_list`는 이것과 다른 얘기다. 그건
**페이지가** 자기 도구를 등록하는 별개 메커니즘이고, 이 앱은 쓰지 않는다.)

### (6) 다음 숙제 — 소비자 말고 제작자 쪽에서 한 번

9절의 Playwright Agents로 바로 넘어가는 것보다, 지금은 **작은 MCP 서버를 직접 짜보는 게**
더 남을 것 같다. 위의 (1)~(4)는 전부 "남이 잘 만든 것을 보고 느낀 것"이라
직접 겪기 전에는 절반만 아는 상태다.

이 앱이 교보재로 마침 알맞다. 예를 들어 도구 두세 개짜리 서버:

```
workout_recent_volume(weeks)      최근 N주 볼륨 추이
workout_exercise_history(name)    특정 종목의 기록
```

만들어 보면 자연히 부딪히는 질문들이 위에서 배운 것과 정확히 겹친다:

- 기록이 500개면 결과를 어떻게 돌려줄까 → **(1)의 "결과가 크면"**
- 없는 종목 이름을 받으면 뭐라고 답할까 → **(1)의 "다음 행동을 지시하는 에러"**
- 세션 id를 모델에게 그대로 줄까, 핸들로 감쌀까 → **(2)**
- 도구를 두 개로 할까 다섯 개로 할까 → **(4)**

그리고 이 앱은 서버가 없고 데이터가 브라우저 IndexedDB에 있어서
(6절 참고) "그럼 Node 쪽 MCP 서버는 그 데이터를 어떻게 읽지?" 라는
성가신 질문이 하나 더 붙는다. 그 자체로 좋은 연습이다.

---

## 6. 이 프로젝트의 테스트 구조

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
  `goto` 후에 지우면 **앱이 이미 읽어버린 뒤**라, 화면은 사라진 데이터를 들고 있고
  Dexie는 빈 DB를 다시 시딩하는 경주가 된다. 시작점을 보장하려면 로드 전이어야 한다.

  > 예전에 여기에 "Dexie가 커넥션을 잡고 있어 삭제가 `blocked` 된다"고 썼었는데 **틀렸다.**
  > 4절(8)에서 직접 확인했다 — Dexie는 `versionchange`를 듣고 자기 커넥션을 스스로 닫아서,
  > 앱이 띄워진 상태에서도 `deleteDatabase`는 `blocked` 없이 그냥 성공한다.
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

## 7. 이 앱에서 실제로 밟은 지뢰들

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

MCP 쪽 짝은 `browser_handle_dialog`다. 다만 **MCP는 이 대목에서 반대로 행동한다** —
조용히 dismiss 하는 게 아니라 `Modal state`를 명시하고, 수락/취소할 때까지
다른 도구를 전부 거부한다. 실제 출력과 비교는 4절(5)에 있다.
그래서 **MCP로 먼저 몰아보면 "여기 confirm이 있다"를 공짜로 알게 된다.**

### (4) `next dev`의 개발 오버레이가 클릭을 가로챈다

412px 폭에서 `<nextjs-portal>`이 하단 네비게이션 위에 겹쳐서
`"<nextjs-portal> intercepts pointer events"` 로 30초를 버티다 죽었다.
앱 설정을 고치는 대신 테스트에서만 CSS로 숨겼다 (프로덕션 빌드에는 없는 요소다).

> 단, **Next 16.3.4 + MCP 실습에선 재현되지 않았다** (4절(9)).
> 오버레이 위치가 바뀐 것으로 보인다. 픽스처의 방어는 공짜니 그대로 두지만,
> "항상 그런다"로 읽으면 안 된다.

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

## 8. 셀렉터 전략

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

## 9. 부록 — 다음 단계: Playwright Agents

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
