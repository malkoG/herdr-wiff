import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatReview, selectSendableThreads } from "../src/courier.js";
import type { WiffComment } from "../src/wiff-schema.js";

const fixturePath = fileURLToPath(new URL("./fixtures/working-copy-session.json", import.meta.url));
const fixture: { comments: WiffComment[] } = JSON.parse(readFileSync(fixturePath, "utf8"));

function human(overrides: Partial<WiffComment> = {}): WiffComment {
  return {
    id: `id-${Math.random()}`,
    author: { name: "kodingwarrior", kind: "human" },
    target: { target: "lines", file: "a.ts", side: "after", start_line: 1, end_line: 1 },
    version: 1,
    anchor: null,
    body: "comment",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: { name: "kodingwarrior", kind: "human" },
    resolved: false,
    resolved_by: null,
    deleted: false,
    deleted_by: null,
    confidence: null,
    number: 1,
    created_seq: 1,
    updated_seq: 1,
    ...overrides,
  };
}

describe("selectSendableThreads (real fixture)", () => {
  it("keeps only the lines-rooted thread, with its reply, when filterNoise is on", () => {
    const threads = selectSendableThreads(fixture.comments, { filterNoise: true });
    expect(threads).toHaveLength(1);
    expect(threads[0].root.number).toBe(1);
    expect(threads[0].root.target.target).toBe("lines");
    expect(threads[0].replies.map((r) => r.number)).toEqual([4]);
  });

  it("keeps every unresolved human thread when filterNoise is off", () => {
    const threads = selectSendableThreads(fixture.comments, { filterNoise: false });
    expect(threads.map((t) => t.root.number).sort()).toEqual([1, 2, 3]);
    const lineThread = threads.find((t) => t.root.number === 1);
    expect(lineThread?.replies.map((r) => r.number)).toEqual([4]);
  });
});

describe("selectSendableThreads (synthetic)", () => {
  it("excludes resolved roots", () => {
    const threads = selectSendableThreads([human({ resolved: true })], { filterNoise: false });
    expect(threads).toHaveLength(0);
  });

  it("excludes deleted roots", () => {
    const threads = selectSendableThreads([human({ deleted: true })], { filterNoise: false });
    expect(threads).toHaveLength(0);
  });

  it("excludes agent-authored roots", () => {
    const threads = selectSendableThreads(
      [human({ author: { name: "claude", kind: "agent" } })],
      { filterNoise: false },
    );
    expect(threads).toHaveLength(0);
  });

  it("keeps a reply attached to its root even though the reply's own target is 'comment'", () => {
    const root = human({ id: "root", number: 1, created_seq: 1 });
    const reply = human({
      id: "reply",
      number: 2,
      created_seq: 2,
      target: { target: "comment", id: "root" },
    });
    const threads = selectSendableThreads([root, reply], { filterNoise: true });
    expect(threads).toHaveLength(1);
    expect(threads[0].replies.map((r) => r.id)).toEqual(["reply"]);
  });

  it("drops a whole thread when the root is not lines-targeted and filterNoise is on", () => {
    const root = human({ id: "root", target: { target: "review" } });
    const reply = human({ id: "reply", target: { target: "comment", id: "root" } });
    const threads = selectSendableThreads([root, reply], { filterNoise: true });
    expect(threads).toHaveLength(0);
  });

  it("dedupes threads by the root's synced.body_marker when filterNoise is on", () => {
    const a = human({ id: "a", number: 1, created_seq: 1, synced: { body_marker: "same", resolved: false } });
    const b = human({ id: "b", number: 2, created_seq: 2, synced: { body_marker: "same", resolved: false } });
    const threads = selectSendableThreads([a, b], { filterNoise: true });
    expect(threads).toHaveLength(1);
    expect(threads[0].root.id).toBe("a");
  });

  it("does not dedupe by body_marker when filterNoise is off", () => {
    const a = human({ id: "a", synced: { body_marker: "same", resolved: false } });
    const b = human({ id: "b", synced: { body_marker: "same", resolved: false } });
    const threads = selectSendableThreads([a, b], { filterNoise: false });
    expect(threads).toHaveLength(2);
  });

  it("sorts threads by the root's created_seq", () => {
    const later = human({ id: "later", created_seq: 5 });
    const earlier = human({ id: "earlier", created_seq: 2 });
    const threads = selectSendableThreads([later, earlier], { filterNoise: false });
    expect(threads.map((t) => t.root.id)).toEqual(["earlier", "later"]);
  });
});

describe("formatReview", () => {
  it("fills in all four placeholders and includes the wiff comment number", () => {
    const thread = {
      root: human({ number: 7, target: { target: "lines", file: "src/foo.ts", side: "after", start_line: 12, end_line: 12 }, body: "fix this" }),
      replies: [] as WiffComment[],
    };
    const text = formatReview([thread], {
      template: "{agent} in {worktree}: {count} thread(s)\n{comments}",
      worktree: "/repo/wt",
      agentLabel: "claude",
    });
    expect(text).toContain("claude in /repo/wt: 1 thread(s)");
    expect(text).toContain("[#7] src/foo.ts:12: fix this");
  });

  it("falls back to a generic label when agentLabel is omitted", () => {
    const text = formatReview([], { template: "{agent}", worktree: "/repo" });
    expect(text).toBe("agent");
  });

  it("renders a line-range location distinctly from a single line", () => {
    const thread = {
      root: human({
        number: 1,
        target: { target: "lines", file: "src/foo.ts", side: "after", start_line: 10, end_line: 14 },
      }),
      replies: [],
    };
    const text = formatReview([thread], { template: "{comments}", worktree: "/repo" });
    expect(text).toContain("src/foo.ts:10-14");
  });

  it("renders replies indented under their root", () => {
    const thread = {
      root: human({ number: 1 }),
      replies: [human({ number: 2, author: { name: "kodingwarrior", kind: "human" }, body: "context" })],
    };
    const text = formatReview([thread], { template: "{comments}", worktree: "/repo" });
    expect(text).toContain("reply [#2] (kodingwarrior): context");
  });
});
