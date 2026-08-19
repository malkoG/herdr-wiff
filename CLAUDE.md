# herdr-wiff

A herdr plugin. Opens wiff code-review sessions in a herdr pane, hands off
comments a human left to the responsible agent, and syncs with GitHub PRs.

## Target tools

- **herdr** — terminal multiplexer for agents (Rust). 0.8.0+
- **wiff** — terminal code-review tool (Rust). Local sessions + GitHub forge integration
- Node 22.12+, TypeScript

## wiff CLI (confirmed only)

Session:
- `wiff new --no-tui --if-needed` — creates one if none exists / refreshes in
  place if the working copy has moved / no-op if already current. **Idempotent.**
  Non-zero only when there is neither a session nor any changes.
- `wiff new --no-tui --if-needed --from-base` — the whole branch (from the fork point)
- `wiff resume` — runs the TUI (human only)
- `wiff refresh` — captures new changes, rebases comments onto the new diff
- `wiff session list` — list of sessions and their ids

Reading:
- `wiff render --format json` — the whole session as JSON. See schema below
- `wiff comment list` — compact listing

Writing (all require `--agent` — attributes the write to an agent):
- `wiff comment add --agent --file F --line N --body "..."`
- `wiff comment add --agent --reply-to <n|ULID> --body "..."`
- `wiff comment resolve --agent <n|ULID>` / `--reopen`
- `wiff comment edit --agent <n>` / `wiff comment rm --agent <n>`

Forge:
- `wiff forge pull <PR number|URL>`
- `wiff forge push [<PR number>] [--session <id>]`
- Token (verified empirically via `wiff forge --help` / `wiff forge pull --help` /
  `wiff forge push --help`): `--forge-token-file <path>` / `--forge-token <T>` go
  **before** the `forge` subcommand (`wiff forge --forge-token-file F pull 1`).
  Whether the `GITHUB_TOKEN` env var is also supported is unverified — it isn't
  mentioned in `--help` — so the plugin implementation uses the one confirmed
  mechanism, `--forge-token-file`: writes the token to a mode-0600 temp file that
  exists only for the duration of that one call, then deletes it immediately.
  Safer than an env var (env vars can leak via `/proc/<pid>/environ`, bare args
  via `ps aux`; the file path itself is not sensitive).

## render --format json schema (schema_version 6)

Verified against a real session (`tests/fixtures/working-copy-session.json`,
captured by reviewing this very repo with wiff). The following points were
confirmed to differ from the initial guess: `anchor.snippet`/`context_before`/
`context_after` are **not** a single string but a **line-by-line `string[]`**.
`description` is **entirely absent as a field** (not an empty object) when a
session never had one set. `resolved_by`/`deleted_by` are not strings but
**`{ name, kind } | null`** (same shape as `author`). `created_at`/`updated_at`/
`updated_by` weren't in the original schema guess but really exist.
`origin`/`synced` (forge-only) are still **unverified** — no forge session was
available to check against — the shapes below are a best-effort guess.

```jsonc
{
  "schema_version": 6,
  "session": { "id", "project", "repo_root", "cwd", "source" },
  "files": [{ "old_path", "new_path", "status", "hunk_count" }],
  "description"?: { "title", "body", "author", "origin"?, "synced_marker"? },
  "comments": [{
    "id": "01M0C…",                    // ULID. Durable id that outlives the session
    "author": { "name", "kind" },      // kind: "human" | "agent"
    "target": { /* polymorphic — the `target` field is the discriminant */ },
    "version": 3,
    "anchor": { "snippet": string[], "context_before": string[], "context_after": string[] } | null,
    "body": "…",
    "created_at": "…", "updated_at": "…", "updated_by": { "name", "kind" },
    "resolved": false, "resolved_by": { "name", "kind" } | null, "resolved_at"?: "…",
    "deleted": false, "deleted_by": { "name", "kind" } | null,
    "confidence": "exact" | null,      // re-anchoring verdict after a refresh
    "origin"?: {                        // unverified — only on comments from a forge, best guess
      "forge": { "provider", "host" },
      "kind": "review_comment" | "verdict" | "description",
      "id": "3810139534",              // the id on GitHub's side
      "url": "…#discussion_r3810139534"
    },
    "synced"?: { "body_marker": "<sha256>", "resolved": false }, // unverified, best guess
    "number": 1,                        // short, review-scoped number (for humans)
    "created_seq": 4, "updated_seq": 7  // monotonically increasing across the whole session
  }]
}
```

`target` variants (all confirmed empirically):
- `{ "target": "lines", "file", "side": "after"|"before", "start_line", "end_line" }`
- `{ "target": "file", "file" }` — a whole-file comment (`wiff comment add --file F` with no `--line`)
- `{ "target": "comment", "id": "<parent ULID>" }` — a reply. `anchor` is null
- `{ "target": "review" }` — a comment on the change as a whole. `anchor` is null

## Constraints confirmed empirically

1. **The TUI belongs to the human.** An agent must never run
   `wiff resume`/`wiff new` (without `--no-tui`)/`wiff forge pull`. A full-screen
   TUI launched from a non-interactive shell hangs forever — or, for `forge pull`
   specifically (confirmed live against a real PR), fails immediately with
   "Device not configured (os error 6)" instead of hanging, since it has no
   `--no-tui` flag at all (its own `--help`: "fetch a pull request into a session
   **and open it**"). `forge push`, by contrast, is confirmed non-interactive —
   verified live, publishing a real comment to a real PR with no tty attached.
   So `review:pr` cannot run `forge pull` from the action process the way `review`
   runs `wiff new --no-tui`; it has to happen inside the pane, which has a real
   tty, exactly like `resume`. The `review-pr` pane entrypoint does this, reading
   the PR number back from the `WIFF_FORGE_PR` env var set when the pane is opened
   (`herdr plugin pane open --env`), fetching the forge token itself, and running
   `wiff forge --forge-token-file F pull <PR>` with real stdio. One direct
   consequence: `review` and `review:pr` pane tracking must be keyed by *which
   entrypoint* is showing, not just by worktree — otherwise a `review:pr` call can
   silently reuse a plain working-copy pane that was never bound to any PR (this
   happened during live testing before the fix).
2. **wiff has no live session daemon.** Unlike hunk, the CLI writes a file and the
   TUI reads it. Even after an agent writes or resolves a comment, an already-open
   TUI does not pick it up automatically — sending the pane `ctrl-r` is required.
3. **`resolve` does not propagate to GitHub.** `forge push` uploads the comment
   body and replies, but does not collapse the thread. A reply is used as a
   workaround to convey that.
4. **The session lives on disk.** Comments survive even if the pane is closed —
   there's no need for special-case handling like "can't deliver once closed."
5. **CI bot comments create noise.** Chatter from PR-review bots like Codex
   (`/codex review`, error messages, review headers) comes along with `forge pull`.
   It's filtered out by restricting to `target.target == "lines"` and deduping by
   `synced.body_marker`.
6. **`wiff new`'s `--from-base`/`--cached`/`--change`/`--base` break in
   non-interactive use.** Verified against wiff 0.1.0: whenever stdin isn't a tty
   (which is always true for a process an agent spawns), it fails immediately with
   "a diff piped on stdin cannot be combined with --cached, --change, --from-base,
   or --base" — not avoidable by redirecting from `/dev/null` or closing stdin
   entirely. Only plain `wiff new --no-tui --if-needed` (working-copy mode, no
   `--from-base`) is confirmed to work non-interactively. That's why
   `[review] default_target` defaults to `working`, not `branch`. `branch` stays
   an opt-in value until this is fixed upstream.
7. **`HERDR_PLUGIN_STATE_DIR`'s real value is `~/.local/state/herdr/plugins/<plugin_id>/`.**
   Guessing it as a sibling of `HERDR_PLUGIN_CONFIG_DIR` (discoverable via
   `herdr plugin config-dir <id>`, e.g. `~/.config/herdr/plugins/config/<id>`) is
   **wrong** — it is not `.config/herdr/plugins/state/<id>`. This mistaken
   assumption once caused `review:pr` to fail to reuse an existing review pane and
   open a duplicate during real testing (not a plugin bug — the plugin code
   always trusted `env.HERDR_PLUGIN_STATE_DIR` as-is; the cause was manual test
   setup seeding a state file at the wrong path). The reliable way to confirm the
   real value is to `console.error` it from inside an action process and read it
   back from `herdr plugin log list`'s stderr.

## Design principles

- **Never put the token in the global env.** Inject it only when spawning the
  wiff process. An agent in a herdr pane must never inherit it.
- **Don't build separate sent-tracking.** The send target is
  `resolved == false && deleted == false`. Once an agent handles a comment and
  resolves it, it naturally drops out — the state machine does the dedup.
- **A human never types the PR number.** It's resolved via `gh pr view --json number`.
- Actions send a herdr notification and log on failure.

## Reference implementation

`jhochenbaum/herdr-hunk-diff` (MIT). The herdr-side plumbing — pane management,
agent-to-worktree association, status-event hooks, keybinding installation, the
plugin config directory — is all implemented there. **Reference the patterns
only; do not follow its code structure.** hunk uses a daemon RPC while wiff is
CLI + files, so the abstractions differ.
