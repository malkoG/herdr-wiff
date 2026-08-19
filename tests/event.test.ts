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
    new ReviewIndex(stateDir).upsert("/repo/wt", { paneId: "wK:p3", paneKey: "review" });

    const status = main({
      HERDR_PLUGIN_STATE_DIR: stateDir,
      HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
        event: "pane_closed",
        data: { type: "pane_closed", pane_id: "wK:p3", workspace_id: "wK" },
      }),
    });

    expect(status).toBe(0);
    expect(new ReviewIndex(stateDir).get("/repo/wt")).toEqual({});
  });

  it("clears on pane_exited the same way", () => {
    new ReviewIndex(stateDir).upsert("/repo/wt", { paneId: "wK:p5", paneKey: "review-pr:42" });

    main({
      HERDR_PLUGIN_STATE_DIR: stateDir,
      HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
        event: "pane_exited",
        data: { type: "pane_exited", pane_id: "wK:p5", workspace_id: "wK" },
      }),
    });

    expect(new ReviewIndex(stateDir).get("/repo/wt")).toEqual({});
  });

  it("does nothing for an unrelated pane id", () => {
    new ReviewIndex(stateDir).upsert("/repo/wt", { paneId: "wK:p3", paneKey: "review" });

    main({
      HERDR_PLUGIN_STATE_DIR: stateDir,
      HERDR_PLUGIN_EVENT_JSON: JSON.stringify({
        event: "pane_closed",
        data: { type: "pane_closed", pane_id: "wK:p9", workspace_id: "wK" },
      }),
    });

    expect(new ReviewIndex(stateDir).get("/repo/wt")).toEqual({ paneId: "wK:p3", paneKey: "review" });
  });

  it("does nothing when the event JSON is missing or malformed", () => {
    expect(main({ HERDR_PLUGIN_STATE_DIR: stateDir })).toBe(0);
    expect(main({ HERDR_PLUGIN_STATE_DIR: stateDir, HERDR_PLUGIN_EVENT_JSON: "not json" })).toBe(0);
  });
});
