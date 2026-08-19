/**
 * Types for `wiff render --format json`, schema_version 6.
 *
 * Grounded in a real render dump (tests/fixtures/working-copy-session.json), captured from a live
 * session in this repo — not just CLAUDE.md's sketch, which turned out to be wrong on a few points:
 * `anchor.snippet`/`context_before`/`context_after` are `string[]` (one entry per line), not a
 * single string; comments also carry `created_at`/`updated_at`/`updated_by` that CLAUDE.md didn't
 * mention; `resolved_by`/`deleted_by` are `WiffAuthor | null`, not a string id; and `description` is
 * absent entirely on a session that never had one set, not just an empty object.
 *
 * `origin`/`synced` (forge-only fields) are still unverified — no forge session was available to
 * inspect — so they're typed loosely from CLAUDE.md's sketch and treated as best-effort.
 */

export interface WiffSession {
  id: string;
  project: string;
  repo_root: string;
  cwd: string;
  source: string;
}

export interface WiffFile {
  old_path: string | null;
  new_path: string | null;
  status: string;
  hunk_count: number;
}

export interface WiffDescription {
  title: string;
  body: string;
  author: string;
  origin?: unknown;
  synced_marker?: string;
}

export interface WiffAuthor {
  name: string;
  kind: "human" | "agent";
}

export type WiffCommentTarget =
  | { target: "lines"; file: string; side: "after" | "before"; start_line: number; end_line: number }
  | { target: "file"; file: string }
  | { target: "comment"; id: string }
  | { target: "review" };

export interface WiffAnchor {
  snippet: string[];
  context_before: string[];
  context_after: string[];
}

/** Unverified: sketched from CLAUDE.md, no forge session was available to confirm against. */
export interface WiffForgeOrigin {
  forge: { provider: string; host: string };
  kind: "review_comment" | "verdict" | "description";
  id: string;
  url: string;
}

/** Unverified: sketched from CLAUDE.md, no forge session was available to confirm against. */
export interface WiffSynced {
  body_marker: string;
  resolved: boolean;
}

export interface WiffComment {
  id: string;
  author: WiffAuthor;
  target: WiffCommentTarget;
  version: number;
  anchor: WiffAnchor | null;
  body: string;
  created_at: string;
  updated_at: string;
  updated_by: WiffAuthor;
  resolved: boolean;
  resolved_by: WiffAuthor | null;
  resolved_at?: string;
  deleted: boolean;
  deleted_by: WiffAuthor | null;
  confidence: "exact" | null;
  origin?: WiffForgeOrigin;
  synced?: WiffSynced;
  number: number;
  created_seq: number;
  updated_seq: number;
}

export interface WiffRender {
  schema_version: number;
  session: WiffSession;
  files: WiffFile[];
  description?: WiffDescription;
  comments: WiffComment[];
}

export const SUPPORTED_SCHEMA_VERSION = 6;
