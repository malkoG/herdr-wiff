# herdr-wiff

herdr 플러그인. wiff 코드리뷰 세션을 herdr pane에서 열고,
사람이 남긴 코멘트를 담당 에이전트에게 전달하고, GitHub PR과 동기화한다.

## 대상 도구

- **herdr** — 에이전트용 터미널 멀티플렉서 (Rust). 0.8.0+
- **wiff** — 터미널 코드리뷰 도구 (Rust). 로컬 세션 + GitHub forge 연동
- Node 22.12+, TypeScript

## wiff CLI (확인된 것만)

세션:
- `wiff new --no-tui --if-needed` — 없으면 생성 / 워킹카피가 움직였으면
  제자리 refresh / 최신이면 no-op. **멱등.** 변경도 세션도 없으면 non-zero
- `wiff new --no-tui --if-needed --from-base` — 브랜치 전체 (fork point 기준)
- `wiff resume` — TUI 실행 (사람 전용)
- `wiff refresh` — 새 변경 캡처, 코멘트를 새 diff 위로 rebase
- `wiff session list` — 세션 목록과 id

읽기:
- `wiff render --format json` — 세션 전체를 JSON으로. 아래 스키마 참조
- `wiff comment list` — 컴팩트 목록

쓰기 (전부 `--agent` 필수 — 에이전트 귀속):
- `wiff comment add --agent --file F --line N --body "..."`
- `wiff comment add --agent --reply-to <n|ULID> --body "..."`
- `wiff comment resolve --agent <n|ULID>` / `--reopen`
- `wiff comment edit --agent <n>` / `wiff comment rm --agent <n>`

forge:
- `wiff forge pull <PR번호|URL>`
- `wiff forge push [<PR번호>] [--session <id>]`
- 토큰 (실측, `wiff forge --help` / `wiff forge pull --help` / `wiff forge push --help`):
  `--forge-token-file <경로>` / `--forge-token <T>`가 `forge` 서브커맨드 **앞**에 위치
  (`wiff forge --forge-token-file F pull 1`). `GITHUB_TOKEN` 환경변수 지원 여부는
  `--help`에 나오지 않아 미검증 — 플러그인 구현은 확실한 쪽인
  `--forge-token-file`을 쓴다: 토큰을 mode 0600 임시 파일에 써서 그 호출 동안만
  존재시키고 즉시 삭제. env var보다 안전 (env는 `/proc/<pid>/environ`으로,
  bare 인자는 `ps aux`로 노출될 수 있는데, 파일 경로 자체는 민감하지 않음).

## render --format json 스키마 (schema_version 6)

실제 세션(`tests/fixtures/working-copy-session.json`, 이 저장소 자체를 wiff로
리뷰하며 뽑음)으로 검증됨. 아래 표시들은 최초 추정과 다르게 확인된 지점:
`anchor.snippet`/`context_before`/`context_after`는 문자열 하나가 아니라
**줄 단위 `string[]`**. `description`은 세션에 설정한 적이 없으면 **필드 자체가
없음** (빈 객체 아님). `resolved_by`/`deleted_by`는 문자열이 아니라
**`{ name, kind } | null`** (author와 동일 shape). `created_at`/`updated_at`/
`updated_by`는 최초 스키마 추정에 없었지만 실제로 존재.
`origin`/`synced` (forge 전용)는 forge 세션을 아직 확보하지 못해 **미검증** —
아래는 최선 추정.

```jsonc
{
  "schema_version": 6,
  "session": { "id", "project", "repo_root", "cwd", "source" },
  "files": [{ "old_path", "new_path", "status", "hunk_count" }],
  "description"?: { "title", "body", "author", "origin"?, "synced_marker"? },
  "comments": [{
    "id": "01M0C…",                    // ULID. 세션을 넘어 유지되는 durable id
    "author": { "name", "kind" },      // kind: "human" | "agent"
    "target": { /* 다형 — target 필드가 판별자 */ },
    "version": 3,
    "anchor": { "snippet": string[], "context_before": string[], "context_after": string[] } | null,
    "body": "…",
    "created_at": "…", "updated_at": "…", "updated_by": { "name", "kind" },
    "resolved": false, "resolved_by": { "name", "kind" } | null, "resolved_at"?: "…",
    "deleted": false, "deleted_by": { "name", "kind" } | null,
    "confidence": "exact" | null,      // refresh 후 재앵커링 판정
    "origin"?: {                        // 미검증 — forge에서 온 코멘트에만, 최선 추정
      "forge": { "provider", "host" },
      "kind": "review_comment" | "verdict" | "description",
      "id": "3810139534",              // GitHub 측 id
      "url": "…#discussion_r3810139534"
    },
    "synced"?: { "body_marker": "<sha256>", "resolved": false }, // 미검증, 최선 추정
    "number": 1,                        // 리뷰 스코프 짧은 번호 (사람용)
    "created_seq": 4, "updated_seq": 7  // 세션 전역 단조 증가
  }]
}
```

`target` 변종 (전부 실측 확인됨):
- `{ "target": "lines", "file", "side": "after"|"before", "start_line", "end_line" }`
- `{ "target": "file", "file" }` — 파일 전체 코멘트 (`wiff comment add --file F` while `--line` 없이)
- `{ "target": "comment", "id": "<부모 ULID>" }` — 답글. `anchor`는 null
- `{ "target": "review" }` — 변경 전체에 대한 코멘트. `anchor`는 null

## 실측으로 확인된 제약

1. **TUI는 사람 것.** 에이전트는 `wiff resume`/`wiff new`(--no-tui 없이)를
   절대 실행하지 않는다. 비대화형 셸에서 전체화면 TUI가 뜨면 멈춘다.
2. **wiff에는 라이브 세션 데몬이 없다.** hunk와 달리 CLI가 파일을 쓰고
   TUI가 파일을 읽는 구조. 에이전트가 코멘트를 쓰거나 resolve해도
   열려 있는 TUI에 자동 반영되지 않는다 → pane에 `ctrl-r` 전송 필요.
3. **`resolve`는 GitHub에 반영되지 않는다.** `forge push`로 코멘트 본문과
   답글은 올라가지만 스레드 접힘은 안 된다. 답글 첨부로 우회한다.
4. **세션은 디스크에 있다.** pane을 닫아도 코멘트가 살아있다.
   "닫으면 전송 불가" 같은 예외 처리가 필요 없다.
5. **CI 봇 코멘트가 노이즈를 만든다.** Codex 등 PR 리뷰 봇의 잡담
   (`/codex review`, 에러 메시지, 리뷰 헤더)이 `forge pull`로 딸려 온다.
   `target.target == "lines"` 필터 + `synced.body_marker` 중복 제거로 걸러진다.
6. **`wiff new`의 `--from-base`/`--cached`/`--change`/`--base`는 비대화형에서 깨진다.**
   wiff 0.1.0 실측: stdin이 tty가 아니면 (에이전트가 spawn한 프로세스는 항상 그렇다)
   "a diff piped on stdin cannot be combined with --cached, --change, --from-base, or --base"
   에러로 즉시 실패한다 — `/dev/null` 리다이렉트나 stdin 완전 차단으로도 회피 불가.
   `--from-base` 없는 plain `wiff new --no-tui --if-needed` (워킹카피 모드)만 비대화형에서
   동작 확인됨. 그래서 `[review] default_target` 기본값은 `branch`가 아니라 `working`이다.
   업스트림에서 고쳐지기 전까지 `branch`는 opt-in 값으로만 유지.
7. **`HERDR_PLUGIN_STATE_DIR` 실측값은 `~/.local/state/herdr/plugins/<plugin_id>/`.**
   `HERDR_PLUGIN_CONFIG_DIR`(`herdr plugin config-dir <id>`로 확인 가능, 예:
   `~/.config/herdr/plugins/config/<id>`)의 형제 디렉터리로 추측하면 **틀린다** —
   `.config/herdr/plugins/state/<id>`가 아니다. 이 착각으로 실제 테스트에서
   `review:pr`이 기존 리뷰 pane을 재사용하지 못하고 중복 pane을 연 적이 있다
   (플러그인 코드 자체는 항상 `env.HERDR_PLUGIN_STATE_DIR`를 그대로 신뢰했으므로
   버그가 아니라 수동 테스트 시 잘못된 경로에 상태 파일을 심어둔 게 원인이었다).
   실제 값을 확인하려면 `HERDR_PLUGIN_STATE_DIR`를 액션 프로세스에서
   `console.error`로 찍어 `herdr plugin log list`의 stderr로 읽는 방법이 확실하다.

## 설계 원칙

- **토큰을 전역 env에 넣지 않는다.** wiff 프로세스를 spawn할 때만 주입.
  herdr pane의 에이전트가 상속하면 안 된다.
- **sent-tracking을 따로 만들지 않는다.** 전송 대상은
  `resolved == false && deleted == false`. 에이전트가 처리 후 resolve하면
  자동으로 빠진다. 상태 기계가 중복 방지를 대신한다.
- **PR 번호를 사람이 입력하지 않는다.** `gh pr view --json number`로 해석.
- 액션은 실패 시 herdr 알림을 보내고 로그에 남긴다.

## 참조 구현

`jhochenbaum/herdr-hunk-diff` (MIT). herdr 쪽 배관 — pane 관리, 에이전트↔
워크트리 연관, 상태 이벤트 훅, 키바인딩 설치, 플러그인 config 디렉터리 —
이 전부 구현돼 있다. **패턴만 참조하고 코드 구조는 따르지 말 것.**
hunk는 데몬 RPC, wiff는 CLI + 파일이라 추상화가 다르다.
