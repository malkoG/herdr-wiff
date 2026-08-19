import { describe, expect, it } from "vitest";
import { readContext } from "../src/context.js";

describe("readContext", () => {
  it("reads fields from HERDR_PLUGIN_CONTEXT_JSON", () => {
    const ctx = readContext({
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({
        workspace_id: "ws-1",
        focused_pane_id: "pane-1",
        focused_pane_agent: "claude",
        focused_pane_cwd: "/repo/wt",
        worktree: { checkout_path: "/repo/wt" },
      }),
      HERDR_PLUGIN_ACTION_ID: "review",
    });

    expect(ctx).toEqual({
      workspaceId: "ws-1",
      paneId: "pane-1",
      agentName: "claude",
      cwd: "/repo/wt",
      worktree: "/repo/wt",
      actionId: "review",
    });
  });

  it("falls back to discrete HERDR_* env vars when context JSON is absent", () => {
    const ctx = readContext({
      HERDR_WORKSPACE_ID: "ws-2",
      HERDR_PANE_ID: "pane-2",
    });
    expect(ctx.workspaceId).toBe("ws-2");
    expect(ctx.paneId).toBe("pane-2");
  });

  it("ignores a workspace checkout that does not contain the focused pane's cwd", () => {
    const ctx = readContext({
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({
        focused_pane_cwd: "/repo/other",
        worktree: { checkout_path: "/repo/wt" },
      }),
    });
    expect(ctx.worktree).toBeUndefined();
    expect(ctx.cwd).toBe("/repo/other");
  });

  it("returns an empty context when nothing is set", () => {
    expect(readContext({})).toEqual({});
  });

  it("treats malformed context JSON as absent", () => {
    expect(readContext({ HERDR_PLUGIN_CONTEXT_JSON: "not json" })).toEqual({});
  });
});
