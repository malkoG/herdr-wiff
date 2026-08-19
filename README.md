# herdr-wiff

A [herdr](https://herdr.dev) plugin that opens wiff code-review sessions in a herdr
pane, hands human review comments off to the agent that owns the diff, and syncs
with GitHub PRs via wiff's forge integration.

See [`CLAUDE.md`](./CLAUDE.md) for the full design notes, the empirically-confirmed
wiff CLI/schema details, and the constraints this plugin works around.

## Install

```sh
npm ci
npm run build
herdr plugin link .
```

`herdr plugin link` builds and registers the plugin locally. Re-run `npm run build`
(or `herdr plugin link .` again) after pulling changes.

## Actions

| Action        | Contexts           | What it does |
| ------------- | ------------------- | ------------ |
| `review`      | workspace, pane      | Opens (or reuses) a wiff review pane for the focused pane's worktree — working copy by default. |
| `review:pr`   | workspace, pane      | Resolves the current branch's PR via `gh`, `wiff forge pull`s it, and opens the review pane. No PR → falls back to `review`. |
| `send-review` | pane                 | Sends unresolved human review comments to the agent that owns this worktree. |
| `sync`        | workspace, pane      | `wiff forge push`es the review's comments and replies back to the PR. |
| `reload`      | workspace, pane      | Sends `ctrl-r` to the open review pane so it picks up changes wiff wrote to disk. |
| `refresh`     | workspace, pane      | `wiff refresh`es the session (captures new changes, rebases comments), then reloads the pane. |

## Configuration

Plugin config lives in the directory printed by `herdr plugin config-dir kodingwarrior.wiff`,
in a `config.toml` file. All fields are optional; an invalid value falls back to its
default and logs a warning (visible via `herdr plugin log list`).

```toml
[review]
placement = "split"        # overlay | split | tab | zoomed
reuse_pane = true
default_target = "working" # working | branch — see CLAUDE.md #6 for why "branch" isn't the default

[roundtrip]
filter_noise = true
reply_on_resolve = true
# prompt_template = "..."  # overrides the built-in default entirely

[forge]
token_command = "gh auth token"
```

## Known limitations

- wiff's `resolve` does not close a GitHub thread — `sync` uploads the comment body
  and any replies, but the thread stays open on GitHub. The reply is what shows the
  outcome there (see `[roundtrip] reply_on_resolve`).
- Only one review pane per worktree is tracked at a time.
- wiff's TUI does not watch the session file — `send-review`/`reload`/`refresh` all
  send `ctrl-r` after mutating it, but any other change (e.g. resolving a comment by
  hand from a shell) needs a manual `reload` to show up in an already-open pane.
