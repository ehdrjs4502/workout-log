# 운동 기록 (workout-log)

폰으로 헬스장에서 쓰는 개인용 운동 기록 PWA.

- 종목별 **세트 / 무게 / 횟수 / RPE** 기록
- 세트 완료 시 **휴식 타이머 자동 시작**, 휴식 시간은 직전 세트에 자동 기록
- **캘린더**로 날짜별 운동 내역
- 기록을 **텍스트로 내보내기** (AI에게 붙여넣어 평가받는 용도)

## 실행

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build && pnpm start
pnpm smoke        # 데이터 레이어 스모크 테스트 (fake-indexeddb)
pnpm lint
```

## 데이터는 어디에 있나

**서버가 없다.** 모든 기록은 브라우저의 IndexedDB(Dexie)에만 있다.

헬스장은 지하·신호 약한 곳이 많아서, 세트를 기록할 때마다 네트워크를 타면
정작 필요할 때 앱이 안 먹는다. 그래서 쓰기는 전부 로컬이고 오프라인에서 100% 동작한다.

대신 로컬 저장소는 사라질 수 있으므로 두 겹으로 막는다.

1. **홈 화면에 설치(PWA)** — iOS Safari는 설치되지 않은 사이트의 IndexedDB를
   7일 미사용 시 삭제한다. 설치가 곧 데이터 보존 수단이다.
2. **설정 → 백업 내보내기** — 전체를 JSON 한 파일로. 가져오기는 `updatedAt`
   기준 last-write-wins로 병합하거나 전체 교체할 수 있다.

설정 화면에 `navigator.storage.persist()` 요청 버튼도 있다 (Chrome/Firefox).

### 나중에 서버를 붙인다면

모든 레코드에 `id(uuid) / createdAt / updatedAt / deletedAt`이 이미 들어 있어서
스키마를 바꾸지 않고 동기화를 얹을 수 있다.

- `GET /sync?since=<ts>` → 서버 변경분, `POST /sync` → 로컬 변경분 배열
- 충돌 해결은 LWW. `src/lib/export/backup.ts`의 병합 로직이 이미 같은 규칙이다.

## 구조

```
src/
  app/
    page.tsx              오늘 — 진행 중 세션 / 최근 기록
    session/[id]/         로깅 화면 (핵심)
    calendar/             월간 캘린더
    export/               텍스트 내보내기
    exercises/            종목 관리
    settings/             알림·백업·저장소
    manifest.ts           PWA manifest
  components/
    session/              로깅 화면 전용 컴포넌트
    ExerciseBrowser.tsx   검색+부위 필터 목록 (관리 화면과 선택 시트가 공유)
    Sheet.tsx / Stepper.tsx / ui.tsx
  lib/
    db/                   Dexie 스키마 · repository · 프리셋 종목
    session/actions.ts    completeSet — 세트 확정 + 휴식 귀속
    stats/volume.ts       세트 부하 · 볼륨 계산 (표시 코드가 전부 여기를 쓴다)
    timer/                useRestTimer · useNow · useWakeLock · alert
    export/               toText · backup · clipboard
    format/date.ts
public/sw.js              서비스워커 (직접 작성)
scripts/smoke.ts          데이터 레이어 검증
```

### 알아둘 설계 결정

**휴식 시간은 입력하지 않는다.** `completeSet()`이 세트를 저장할 때,
직전 세트를 마친 뒤 흐른 시간을 그 세트의 `restSec`에 확정 기록하고 새 타이머를 시작한다.
휴식 중에 운동을 끝내거나 타이머를 건너뛰어도 그 시간은 버려지지 않는다
(`finalizeRestTimer()`).

**타이머를 setInterval로 세지 않는다.** 저장하는 값은 `startedAt`과 `targetSec`
두 개뿐이고 남은 시간은 매번 `Date.now()`로 역산한다. 화면이 꺼지거나 탭이
백그라운드로 가면 타이머 콜백은 스로틀링되지만, 복귀 시점(`visibilitychange`)에
계산된 값은 정확하다. IndexedDB에 저장하므로 앱을 완전히 껐다 켜도 이어진다.

**`deletedAt`과 `endedAt`은 0 sentinel.** IndexedDB가 `null`을 인덱싱하지 못해서
`[deletedAt+endedAt]` 같은 복합 인덱스를 쓰려면 `null` 대신 `0`이어야 한다.

**`SetLog.exerciseId`는 비정규화 사본.** "이 종목 지난번 기록" 프리필을
join 없이 `[exerciseId+completedAt]` 인덱스 한 방으로 끝내기 위한 것.
`sessionExercise` 생성 후 종목이 바뀌지 않으므로 안전하다.

**맨몸 운동의 몸무게는 세트에 복사해 둔다.** 풀업·딥스처럼 `usesBodyWeight`가
켜진 종목의 볼륨은 `(추가중량 + 몸무게) × 횟수`인데, 여기서 쓰는 몸무게는 설정값을
그때그때 읽은 게 아니라 세트를 저장하는 순간의 값을 `SetLog.bodyWeightKg`에 박아둔
것이다. 그러지 않으면 몸무게를 한 번 고칠 때마다 지난 기록의 볼륨이 전부 따라
움직인다. 몸무게가 미설정이면 `null`이고, 맨몸 세트는 예전처럼 볼륨 0으로 잡힌다.

**서비스워커는 직접 작성했다.** `@serwist/next`는 webpack 플러그인이라
Next 16의 기본 Turbopack 빌드와 맞지 않는다. 이 앱은 서버에서 받아올 게
앱 셸뿐이라 빌드 매니페스트 없이 런타임 캐싱만으로 충분하다.

## 폰에서 테스트할 때

> **로컬 IP(`http://192.168.x.x:3000`)로 접속하면 안 된다.**
> Wake Lock · Notification · Service Worker · Clipboard는 secure context
> (HTTPS 또는 localhost) 전용이라, 이 주소로 열면 전부 조용히 죽는다.
> 설정 화면 맨 위에 경고 배너가 뜬다.

Vercel preview로 배포해서 https 주소로 접속할 것.

### 체크리스트

- [ ] 세트 3개 입력 → 새로고침 → 그대로 복구
- [ ] **비행기 모드**로 세션 시작 → 종목 추가 → 세트 기록 → 종료 완주
- [ ] 타이머 90초 시작 → 화면 끄고 2분 대기 → 켰을 때 시간이 어긋나지 않음
- [ ] 두 번째 세트 완료 후 첫 세트의 휴식 시간이 실제 경과와 일치
- [ ] iOS 홈 화면 설치 PWA에서 소리·진동·알림 (안 되는 항목은 설정에 표시되는지)
- [ ] 캘린더에 기록한 날짜가 뜨고 탭하면 상세로 이동
- [ ] 내보낸 텍스트를 AI에 붙여넣어 평가가 나옴
- [ ] JSON 내보내기 → 브라우저 데이터 전체 삭제 → 가져오기로 완전 복구
