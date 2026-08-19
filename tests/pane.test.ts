import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runReviewPane, type SpawnFn } from "../src/bin/pane.js";

describe("runReviewPane (review mode)", () => {
  it("spawns wiff resume with real stdio in the worktree", () => {
    const spawn: SpawnFn = vi.fn().mockReturnValue({ status: 0 });
    const notify = vi.fn();
    const status = runReviewPane({}, "/repo/wt", "review", spawn, notify);

    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledWith("wiff", ["resume"], { stdio: "inherit", cwd: "/repo/wt" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies on a non-zero exit", () => {
    const spawn: SpawnFn = vi.fn().mockReturnValue({ status: 3 });
    const notify = vi.fn();
    runReviewPane({}, "/repo/wt", "review", spawn, notify);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("resume exited 3"));
  });
});

describe("runReviewPane (review-pr mode)", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "wiff-pane-config-"));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("fails and notifies when no PR number was passed", () => {
    const spawn: SpawnFn = vi.fn();
    const notify = vi.fn();
    const status = runReviewPane({}, "/repo/wt", "review-pr", spawn, notify);
    expect(status).toBe(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("no pull request number"));
    expect(spawn).not.toHaveBeenCalled();
  });

  it("fails and notifies when the token command fails", () => {
    writeFileSync(join(configDir, "config.toml"), `[forge]\ntoken_command = "exit 1"\n`);
    const spawn: SpawnFn = vi.fn();
    const notify = vi.fn();
    const env = { HERDR_PLUGIN_CONFIG_DIR: configDir, WIFF_FORGE_PR: "7" };
    const status = runReviewPane(env, "/repo/wt", "review-pr", spawn, notify);
    expect(status).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns forge pull with --forge-token-file before the PR number, with real stdio", () => {
    writeFileSync(join(configDir, "config.toml"), `[forge]\ntoken_command = "echo ghp_secret"\n`);
    const spawn: SpawnFn = vi.fn().mockReturnValue({ status: 0 });
    const notify = vi.fn();
    const env = { HERDR_PLUGIN_CONFIG_DIR: configDir, WIFF_FORGE_PR: "7" };
    const status = runReviewPane(env, "/repo/wt", "review-pr", spawn, notify);

    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      "wiff",
      ["forge", "--forge-token-file", expect.any(String), "pull", "7"],
      { stdio: "inherit", cwd: "/repo/wt" },
    );
  });

  it("notifies on a non-zero forge pull exit", () => {
    writeFileSync(join(configDir, "config.toml"), `[forge]\ntoken_command = "echo ghp_secret"\n`);
    const spawn: SpawnFn = vi.fn().mockReturnValue({ status: 2 });
    const notify = vi.fn();
    const env = { HERDR_PLUGIN_CONFIG_DIR: configDir, WIFF_FORGE_PR: "7" };
    runReviewPane(env, "/repo/wt", "review-pr", spawn, notify);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("forge pull exited 2"));
  });
});
