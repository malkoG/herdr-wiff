import type { WiffComment, WiffCommentTarget } from "./wiff-schema.js";

export interface CommentThread {
  root: WiffComment;
  /** Non-root replies in the thread, oldest first. */
  replies: WiffComment[];
}

export interface SelectSendableOptions {
  filterNoise: boolean;
}

/** Walks `target: "comment"` links up to the thread's root (a `lines`/`file`/`review` comment). */
function rootOf(comment: WiffComment, byId: Map<string, WiffComment>): WiffComment {
  let current = comment;
  const seen = new Set<string>();
  while (current.target.target === "comment" && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.target.id);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function isSendableRoot(root: WiffComment, opts: SelectSendableOptions): boolean {
  if (root.author.kind !== "human") return false;
  if (root.resolved || root.deleted) return false;
  if (opts.filterNoise && root.target.target !== "lines") return false;
  return true;
}

/**
 * Groups comments into threads by their root, keeping only threads whose root is an unresolved,
 * non-deleted human comment. Replies are always included alongside a sendable root regardless of
 * their own target/author, since a thread must travel together for the agent to have context.
 *
 * With `filterNoise` on: only `lines`-target roots qualify (PR-bot chatter from `forge pull`
 * tends to land as `review`/`file`-level comments), and threads are deduped by the root's
 * `synced.body_marker` so a comment synced from GitHub more than once is sent only once.
 */
export function selectSendableThreads(
  comments: WiffComment[],
  opts: SelectSendableOptions,
): CommentThread[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const threads = new Map<string, CommentThread>();

  for (const comment of comments) {
    if (comment.deleted) continue;
    const root = rootOf(comment, byId);
    if (!isSendableRoot(root, opts)) continue;

    let thread = threads.get(root.id);
    if (!thread) {
      thread = { root, replies: [] };
      threads.set(root.id, thread);
    }
    if (comment.id !== root.id) thread.replies.push(comment);
  }

  let result = [...threads.values()];
  for (const thread of result) thread.replies.sort((a, b) => a.created_seq - b.created_seq);
  result.sort((a, b) => a.root.created_seq - b.root.created_seq);

  if (opts.filterNoise) {
    const seenMarkers = new Set<string>();
    result = result.filter((thread) => {
      const marker = thread.root.synced?.body_marker;
      if (!marker) return true;
      if (seenMarkers.has(marker)) return false;
      seenMarkers.add(marker);
      return true;
    });
  }

  return result;
}

function describeLocation(target: WiffCommentTarget): string {
  switch (target.target) {
    case "lines":
      return target.start_line === target.end_line
        ? `${target.file}:${target.start_line}`
        : `${target.file}:${target.start_line}-${target.end_line}`;
    case "file":
      return target.file;
    case "review":
      return "review";
    case "comment":
      return "reply";
  }
}

function formatThread(thread: CommentThread): string {
  const lines = [`- [#${thread.root.number}] ${describeLocation(thread.root.target)}: ${thread.root.body}`];
  for (const reply of thread.replies) {
    lines.push(`  - reply [#${reply.number}] (${reply.author.name}): ${reply.body}`);
  }
  return lines.join("\n");
}

export interface FormatReviewOptions {
  template: string;
  worktree: string;
  agentLabel?: string;
}

/** Fills `{comments}` `{count}` `{worktree}` `{agent}` placeholders in the configured template. */
export function formatReview(threads: CommentThread[], opts: FormatReviewOptions): string {
  const commentsText = threads.map(formatThread).join("\n\n");
  return opts.template
    .replaceAll("{comments}", commentsText)
    .replaceAll("{count}", String(threads.length))
    .replaceAll("{worktree}", opts.worktree)
    .replaceAll("{agent}", opts.agentLabel ?? "agent");
}
