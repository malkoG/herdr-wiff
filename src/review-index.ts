import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

export interface ReviewEntry {
  /**
   * Map from reuse key (`"review"` for the plain working-copy/branch pane, `"review-pr:<number>"`
   * for a specific PR's pane) to the pane currently showing it. Tracked per key, not as a single
   * slot: wiff's TUI can't be re-pointed once spawned, so switching keys opens another pane
   * alongside the old one rather than replacing it — a single slot would silently lose track of
   * that still-live pane, making `review` -> `review:pr` -> `review` (or PR 42 -> PR 99 -> PR 42)
   * open a needless duplicate on the third call even though the original is still open (flagged by
   * a real Codex review of this exact code, after an earlier fix introduced exactly that bug).
   */
  panes?: Record<string, string>;
  /** Pane running the agent that owns this worktree's changes; the target for `agent prompt`. */
  agentPaneId?: string;
  /** Human-readable agent kind; use `agentPaneId` for addressing. */
  agentName?: string;
}

const STALE_LOCK_MS = 10_000;
const ACQUIRE_TIMEOUT_MS = 2_000;
const POLL_MS = 5;

/** Blocks without spinning while another short-lived process holds the lock. */
function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Cross-process worktree -> { review panes, agent pane } map. herdr has no built-in "reuse an
 * existing pane" or "which agent owns this worktree" concept, so the plugin tracks both itself;
 * writes use an atomic rename so concurrent readers never observe partial JSON.
 */
export class ReviewIndex {
  private readonly file: string;
  private readonly lockFile: string;

  constructor(stateDir: string) {
    mkdirSync(stateDir, { recursive: true });
    this.file = join(stateDir, "review-index.json");
    this.lockFile = `${this.file}.lock`;
  }

  private read(): Record<string, ReviewEntry> {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, ReviewEntry>)
        : {};
    } catch {
      return {};
    }
  }

  private write(entries: Record<string, ReviewEntry>): void {
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(entries, null, 2));
      renameSync(tmp, this.file);
    } catch (err) {
      try {
        rmSync(tmp, { force: true });
      } catch {
        // Preserve the original write error.
      }
      throw err;
    }
  }

  private mutate(fn: (entries: Record<string, ReviewEntry>) => void): void {
    const release = this.acquire();
    try {
      const entries = this.read();
      fn(entries);
      this.write(entries);
    } finally {
      release();
    }
  }

  private acquire(): () => void {
    const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
    for (;;) {
      try {
        const fd = openSync(this.lockFile, "wx");
        try {
          writeSync(fd, String(process.pid));
        } finally {
          closeSync(fd);
        }
        return () => {
          try {
            rmSync(this.lockFile, { force: true });
          } catch {
            // A peer may already have broken this lock as stale.
          }
        };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        if (this.breakIfStale()) continue;
        if (Date.now() < deadline) {
          sleep(POLL_MS);
          continue;
        }
        return () => {};
      }
    }
  }

  private breakIfStale(): boolean {
    try {
      const age = Date.now() - statSync(this.lockFile).mtimeMs;
      if (age < STALE_LOCK_MS) return false;
      rmSync(this.lockFile, { force: true });
      return true;
    } catch {
      return true;
    }
  }

  get(worktree: string): ReviewEntry | undefined {
    return this.read()[worktree];
  }

  /** Convenience accessor: the pane tracked for one reuse key on one worktree, if any. */
  getPane(worktree: string, key: string): string | undefined {
    return this.get(worktree)?.panes?.[key];
  }

  /** Records which pane is showing `key`, without disturbing any other key's tracked pane. */
  setPane(worktree: string, key: string, paneId: string): void {
    this.mutate((entries) => {
      const existing = entries[worktree] ?? {};
      entries[worktree] = { ...existing, panes: { ...existing.panes, [key]: paneId } };
    });
  }

  /** Merges in only the defined fields, preserving whatever else is already recorded. */
  upsert(worktree: string, patch: { agentPaneId?: string; agentName?: string }): void {
    this.mutate((entries) => {
      const existing = entries[worktree] ?? {};
      const merged: ReviewEntry = { ...existing };
      for (const [key, value] of Object.entries(patch) as ["agentPaneId" | "agentName", string | undefined][]) {
        if (value !== undefined) merged[key] = value;
      }
      entries[worktree] = merged;
    });
  }

  clear(worktree: string): void {
    this.mutate((entries) => {
      delete entries[worktree];
    });
  }

  /**
   * Drops whichever reuse-key entries currently point at `paneId`, across every worktree — used
   * when herdr reports the pane closed or its process exited, so a stale entry can't make a later
   * `review`/`review:pr` call think a since-vanished pane is still there to reuse. Leaves
   * `agentPaneId`/`agentName` and every other key's pane alone.
   */
  clearPaneById(paneId: string): void {
    this.mutate((entries) => {
      for (const entry of Object.values(entries)) {
        if (!entry.panes) continue;
        for (const [key, id] of Object.entries(entry.panes)) {
          if (id === paneId) delete entry.panes[key];
        }
      }
    });
  }
}
