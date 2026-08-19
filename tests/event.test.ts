import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/bin/event.js";
import { ReviewIndex } from "../src/review-index.js";

describe("event.main", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), "wiff-event-"));
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("clears the matching worktree's pane tracking on pane_closed", () => {
    new ReviewIndex(stateDir).setPane("/repo/wt", "review", "wK:p3");

    const status = main({
      HERDR_PLUGIN_STATE_DIR: stateDir,
      HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
        event: "pane_closed",
        data: { type: "pane_closed", pane_id: "wK:p3", workspace_id: "wK" },
      }),
    });

    expect(status).toBe(0);
    expect(new ReviewIndex(stateDir).get("/repo/wt")).toEqual({ panes: {} });
  });

  it("clears on pane_exited the same way", () => {
    new ReviewIndex(stateDir).setPane("/repo/wt", "review-pr:42", "wK:p5");

    main({
      HERDR_PLUGIN_STATE_DIR: stateDir,
      HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
        event: "pane_exited",
        data: { type: "pane_exited", pane_id: "wK:p5", workspace_id: "wK" },
      }),
    });

    expect(new ReviewIndex(stateDir).get("/repo/wt")).toEqual({ panes: {} });
  });

  it("clears only the matching key, leaving another live pane on the same worktree tracked", () => {
    const index = new ReviewIndex(stateDir);
    index.setPane("/repo/wt", "review", "wK:p3");
    index.setPane("/repo/wt", "review-pr:42", "wK:p8");

    main({
      HERDR_PLUGIN_STATE_DIR: stateDir,
      HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
        event: "pane_closed",
        data: { type: "pane_closed", pane_id: "wK:p3", workspace_id: "wK" },
      }),
    });

    expect(new ReviewIndex(stateDir).get("/repo/wt")).toEqual({ panes: { "review-pr:42": "wK:p8" } });
  });

  it("does nothing for an unrelated pane id", () => {
    new ReviewIndex(stateDir).setPane("/repo/wt", "review", "wK:p3");

    main({
      HERDR_PLUGIN_STATE_DIR: stateDir,
      HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
        event: "pane_closed",
        data: { type: "pane_closed", pane_id: "wK:p9", workspace_id: "wK" },
      }),
    });

    expect(new ReviewIndex(stateDir).get("/repo/wt")).toEqual({ panes: { review: "wK:p3" } });
  });

  it("does nothing when the event JSON is missing or malformed", () => {
    expect(main({ HERDR_PLUGIN_STATE_DIR: stateDir })).toBe(0);
    expect(main({ HERDR_PLUGIN_STATE_DIR: stateDir, HERDR_PLUGIN_EVENT_JSON: "not json" })).toBe(0);
  });
});
