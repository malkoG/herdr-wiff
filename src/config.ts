import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { asObject, type JsonObject } from "./json.js";

/** Placements that return a pane id, which `reuse_pane` needs to track. */
export type Placement = "overlay" | "split" | "tab" | "zoomed";

/**
 * `working` reviews the working copy; `branch` reviews the whole branch against its fork point
 * (`--from-base`). Verified against wiff 0.1.0: `--from-base` (like `--cached`/`--change`/`--base`)
 * unconditionally fails outside a real tty stdin, which every agent-spawned process has — so
 * `branch` cannot be the default until that's fixed upstream. It stays a valid opt-in value.
 */
export type DefaultTarget = "working" | "branch";

/**
 * With `reply_on_resolve` (the default): wiff's `resolve` doesn't close a GitHub thread on its
 * own, so `forge push` needs a reply on record to show the outcome there.
 */
export const REPLY_THEN_RESOLVE_TEMPLATE = `Human-authored review comments on your changes in {worktree} ({count} thread(s)):

{comments}

For each thread: address it, then reply with a short summary of what you did using
\`wiff comment add --agent --reply-to <number> --body "..."\`, and resolve it with
\`wiff comment resolve --agent <number>\`. wiff's resolve does not close a GitHub thread on its
own, so the reply is what shows the outcome there. If a comment is unclear or needs a decision
from the human, reply with a focused question instead of resolving it. When you're done, briefly
summarize what you changed and what, if anything, is still open.`;

/** Used when `reply_on_resolve` is off: purely local review, no forge thread to leave a trace in. */
export const RESOLVE_ONLY_TEMPLATE = `Human-authored review comments on your changes in {worktree} ({count} thread(s)):

{comments}

For each thread: address it, then resolve it with \`wiff comment resolve --agent <number>\`. If a
comment is unclear or needs a decision from the human, leave it open and ask a focused question
instead. When you're done, briefly summarize what you changed and what, if anything, is still open.`;

/** @deprecated kept as an alias of {@link REPLY_THEN_RESOLVE_TEMPLATE} for anyone importing the old name. */
export const DEFAULT_PROMPT_TEMPLATE = REPLY_THEN_RESOLVE_TEMPLATE;

export interface PluginConfig {
  review: {
    placement: Placement;
    reuse_pane: boolean;
    default_target: DefaultTarget;
  };
  roundtrip: {
    /**
     * Verified against a forge-pulled session: PR review-bot chatter (`/codex review`, error
     * dumps, review headers) tends to land as `review`/`file`-level comments, not `lines`-level
     * ones. Restricting to `lines` and deduping by `synced.body_marker` filters it out.
     */
    filter_noise: boolean;
    /** Selects the built-in default prompt template; ignored once `prompt_template` is set explicitly. */
    reply_on_resolve: boolean;
    prompt_template: string;
  };
  forge: {
    /** Run to obtain a forge token, output on stdout. Never written to `process.env` or logged. */
    token_command: string;
  };
}

export const DEFAULTS: PluginConfig = {
  review: {
    placement: "split",
    reuse_pane: true,
    default_target: "working",
  },
  roundtrip: {
    filter_noise: true,
    reply_on_resolve: true,
    prompt_template: REPLY_THEN_RESOLVE_TEMPLATE,
  },
  forge: {
    token_command: "gh auth token",
  },
};

const PLACEMENTS: Placement[] = ["overlay", "split", "tab", "zoomed"];
const TARGETS: DefaultTarget[] = ["working", "branch"];

type Warn = (message: string) => void;

function pick<T extends string>(
  value: unknown,
  allowed: T[],
  fallback: T,
  field: string,
  warn: Warn,
): T {
  if (typeof value === "string" && (allowed as string[]).includes(value)) return value as T;
  if (value !== undefined) {
    warn(`wiff: invalid value for "${field}" (${JSON.stringify(value)}); using "${fallback}".`);
  }
  return fallback;
}

function bool(value: unknown, fallback: boolean, field: string, warn: Warn): boolean {
  if (typeof value === "boolean") return value;
  if (value !== undefined) {
    warn(`wiff: invalid value for "${field}" (${JSON.stringify(value)}); using ${fallback}.`);
  }
  return fallback;
}

function string(value: unknown, fallback: string, field: string, warn: Warn): string {
  if (typeof value === "string") return value;
  if (value !== undefined) {
    warn(`wiff: invalid value for "${field}" (expected a string); using the default.`);
  }
  return fallback;
}

export function loadConfig(configDir: string, warn: Warn = (m) => console.error(m)): PluginConfig {
  let raw: JsonObject = {};
  try {
    raw = asObject(parse(readFileSync(join(configDir, "config.toml"), "utf8"))) ?? {};
  } catch {
    return structuredClone(DEFAULTS);
  }

  const r = asObject(raw.review) ?? {};
  const t = asObject(raw.roundtrip) ?? {};
  const f = asObject(raw.forge) ?? {};

  const reply_on_resolve = bool(
    t.reply_on_resolve,
    DEFAULTS.roundtrip.reply_on_resolve,
    "roundtrip.reply_on_resolve",
    warn,
  );

  return {
    review: {
      placement: pick(r.placement, PLACEMENTS, DEFAULTS.review.placement, "review.placement", warn),
      reuse_pane: bool(r.reuse_pane, DEFAULTS.review.reuse_pane, "review.reuse_pane", warn),
      default_target: pick(
        r.default_target,
        TARGETS,
        DEFAULTS.review.default_target,
        "review.default_target",
        warn,
      ),
    },
    roundtrip: {
      filter_noise: bool(
        t.filter_noise,
        DEFAULTS.roundtrip.filter_noise,
        "roundtrip.filter_noise",
        warn,
      ),
      reply_on_resolve,
      prompt_template: string(
        t.prompt_template,
        reply_on_resolve ? REPLY_THEN_RESOLVE_TEMPLATE : RESOLVE_ONLY_TEMPLATE,
        "roundtrip.prompt_template",
        warn,
      ),
    },
    forge: {
      token_command: string(
        f.token_command,
        DEFAULTS.forge.token_command,
        "forge.token_command",
        warn,
      ),
    },
  };
}
