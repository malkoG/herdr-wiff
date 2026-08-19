import { describe, expect, it, vi } from "vitest";
import { DEFAULTS, type PluginConfig } from "../src/config.js";
import type { HerdrContext } from "../src/context.js";
import { sendReviewAction, type SendReviewDeps } from "../src/send-review.js";
import type { WiffComment, WiffRender } from "../src/wiff-schema.js";

function lineComment(overrides: Partial<WiffComment> = {}): WiffComment {
  return {
    id: "c1",
    author: { name: "kodingwarrior", kind: "human" },
    target: { target: "lines", file: "a.ts", side: "after", start_line: 1, end_line: 1 },
    version: 1,
    anchor: null,
    body: "please fix",
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

function render(comments: WiffComment[], schemaVersion = 6): WiffRender {
  return {
    schema_version: schemaVersion,
    session: { id: "s1", project: "p", repo_root: "/repo/wt", cwd: "/repo/wt", source: "git working copy" },
    files: [],
    comments,
  };
}

function makeDeps(overrides: Partial<SendReviewDeps> = {}): SendReviewDeps & {
  notify: ReturnType<typeof vi.fn>;
  promptAgent: ReturnType<typeof vi.fn>;
  sendKeys: ReturnType<typeof vi.fn>;
  renderFn: ReturnType<typeof vi.fn>;
  indexGet: ReturnType<typeof vi.fn>;
} {
  const notify = vi.fn();
  const promptAgent = vi.fn().mockReturnValue(true);
  const sendKeys = vi.fn().mockReturnValue(true);
  const renderFn = vi.fn().mockReturnValue(render([lineComment()]));
  const indexGet = vi.fn().mockReturnValue({
    panes: { review: "review-pane" },
    agentPaneId: "agent-pane",
    agentName: "claude",
  });

  const cfg: PluginConfig = structuredClone(DEFAULTS);
  const ctx: HerdrContext = { worktree: "/repo/wt" };

  const deps: SendReviewDeps = {
    cfg,
    ctx,
    herdr: { notify, promptAgent, sendKeys },
    wiff: { render: renderFn },
    reviewIndex: { get: indexGet },
    ...overrides,
  };

  return { ...deps, notify, promptAgent, sendKeys, renderFn, indexGet };
}

describe("sendReviewAction", () => {
  it("notifies and fails when no worktree can be determined", () => {
    const deps = makeDeps({ ctx: {} });
    expect(sendReviewAction(deps)).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not determine"));
  });

  it("notifies and fails when wiff render returns nothing", () => {
    const deps = makeDeps();
    deps.renderFn.mockReturnValue(null);
    expect(sendReviewAction(deps)).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not read"));
  });

  it("warns but continues on an unexpected schema_version", () => {
    const deps = makeDeps();
    deps.renderFn.mockReturnValue(render([lineComment()], 7));
    const status = sendReviewAction(deps);
    expect(status).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("schema_version"));
    expect(deps.promptAgent).toHaveBeenCalled();
  });

  it("notifies and exits 0 when there is nothing sendable", () => {
    const deps = makeDeps();
    deps.renderFn.mockReturnValue(render([lineComment({ resolved: true })]));
    expect(sendReviewAction(deps)).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("no new review comments"));
    expect(deps.promptAgent).not.toHaveBeenCalled();
  });

  it("fails when no agent is associated with the worktree", () => {
    const deps = makeDeps({ reviewIndex: { get: vi.fn().mockReturnValue(undefined) } });
    const status = sendReviewAction(deps);
    expect(status).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("no agent is associated"));
  });

  it("prompts the agent pane recorded in the review index and refreshes the review pane", () => {
    const deps = makeDeps();
    const status = sendReviewAction(deps);
    expect(status).toBe(0);
    expect(deps.promptAgent).toHaveBeenCalledWith("agent-pane", expect.stringContaining("[#1]"));
    expect(deps.sendKeys).toHaveBeenCalledWith("review-pane", "ctrl+r");
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("sent 1 comment thread"));
  });

  it("prefers the invoking pane as the target when it is itself an agent pane", () => {
    const deps = makeDeps({ ctx: { worktree: "/repo/wt", paneId: "self-pane", agentName: "claude" } });
    sendReviewAction(deps);
    expect(deps.promptAgent).toHaveBeenCalledWith("self-pane", expect.any(String));
  });

  it("fails and does not refresh when promptAgent fails", () => {
    const deps = makeDeps();
    deps.promptAgent.mockReturnValue(false);
    const status = sendReviewAction(deps);
    expect(status).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("could not prompt"));
    expect(deps.sendKeys).not.toHaveBeenCalled();
  });

  it("refreshes every tracked pane, not just one", () => {
    const deps = makeDeps({
      reviewIndex: {
        get: vi.fn().mockReturnValue({
          panes: { review: "review-pane", "review-pr:1": "pr-pane" },
          agentPaneId: "agent-pane",
          agentName: "claude",
        }),
      },
    });
    sendReviewAction(deps);
    expect(deps.sendKeys).toHaveBeenCalledWith("review-pane", "ctrl+r");
    expect(deps.sendKeys).toHaveBeenCalledWith("pr-pane", "ctrl+r");
  });

  it("applies filter_noise from config", () => {
    const deps = makeDeps();
    deps.cfg.roundtrip.filter_noise = true;
    deps.renderFn.mockReturnValue(render([lineComment({ target: { target: "review" } })]));
    const status = sendReviewAction(deps);
    expect(status).toBe(0);
    expect(deps.notify).toHaveBeenCalledWith(expect.stringContaining("no new review comments"));
  });
});
