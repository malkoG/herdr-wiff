import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULTS, RESOLVE_ONLY_TEMPLATE, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wiff-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns defaults when config.toml is missing", () => {
    expect(loadConfig(dir)).toEqual(DEFAULTS);
  });

  it("parses valid values", () => {
    writeFileSync(
      join(dir, "config.toml"),
      `[review]\nplacement = "tab"\nreuse_pane = false\ndefault_target = "working"\n`,
    );
    expect(loadConfig(dir)).toEqual({
      review: { placement: "tab", reuse_pane: false, default_target: "working" },
      roundtrip: DEFAULTS.roundtrip,
      forge: DEFAULTS.forge,
    });
  });

  it("parses a custom roundtrip section", () => {
    writeFileSync(
      join(dir, "config.toml"),
      `[roundtrip]\nfilter_noise = false\nprompt_template = "custom {comments}"\n`,
    );
    const cfg = loadConfig(dir);
    expect(cfg.roundtrip).toEqual({
      filter_noise: false,
      reply_on_resolve: true,
      prompt_template: "custom {comments}",
    });
  });

  it("falls back to the default roundtrip section and warns on invalid values", () => {
    writeFileSync(
      join(dir, "config.toml"),
      `[roundtrip]\nfilter_noise = "sure"\nreply_on_resolve = "sure"\nprompt_template = 5\n`,
    );
    const warnings: string[] = [];
    const cfg = loadConfig(dir, (m) => warnings.push(m));
    expect(cfg.roundtrip).toEqual(DEFAULTS.roundtrip);
    expect(warnings.join("\n")).toContain("roundtrip.filter_noise");
    expect(warnings.join("\n")).toContain("roundtrip.reply_on_resolve");
    expect(warnings.join("\n")).toContain("roundtrip.prompt_template");
  });

  it("switches the default prompt template when reply_on_resolve is off", () => {
    writeFileSync(join(dir, "config.toml"), `[roundtrip]\nreply_on_resolve = false\n`);
    const cfg = loadConfig(dir);
    expect(cfg.roundtrip.prompt_template).toBe(RESOLVE_ONLY_TEMPLATE);
    expect(cfg.roundtrip.prompt_template).not.toContain("reply-to");
  });

  it("keeps an explicit prompt_template regardless of reply_on_resolve", () => {
    writeFileSync(
      join(dir, "config.toml"),
      `[roundtrip]\nreply_on_resolve = false\nprompt_template = "keep {comments}"\n`,
    );
    const cfg = loadConfig(dir);
    expect(cfg.roundtrip.prompt_template).toBe("keep {comments}");
  });

  it("parses a custom forge section", () => {
    writeFileSync(join(dir, "config.toml"), `[forge]\ntoken_command = "echo hi"\n`);
    const cfg = loadConfig(dir);
    expect(cfg.forge).toEqual({ token_command: "echo hi" });
  });

  it("falls back to the default forge section and warns on an invalid token_command", () => {
    writeFileSync(join(dir, "config.toml"), `[forge]\ntoken_command = 5\n`);
    const warnings: string[] = [];
    const cfg = loadConfig(dir, (m) => warnings.push(m));
    expect(cfg.forge).toEqual(DEFAULTS.forge);
    expect(warnings.join("\n")).toContain("forge.token_command");
  });

  it("falls back to defaults and warns on invalid values", () => {
    writeFileSync(
      join(dir, "config.toml"),
      `[review]\nplacement = "sideways"\nreuse_pane = "yes"\ndefault_target = "everything"\n`,
    );
    const warnings: string[] = [];
    const cfg = loadConfig(dir, (m) => warnings.push(m));
    expect(cfg).toEqual(DEFAULTS);
    expect(warnings).toHaveLength(3);
    expect(warnings.join("\n")).toContain("review.placement");
    expect(warnings.join("\n")).toContain("review.reuse_pane");
    expect(warnings.join("\n")).toContain("review.default_target");
  });

  it("does not warn when a field is simply absent", () => {
    writeFileSync(join(dir, "config.toml"), `[review]\nplacement = "overlay"\n`);
    const warnings: string[] = [];
    const cfg = loadConfig(dir, (m) => warnings.push(m));
    expect(cfg.review.placement).toBe("overlay");
    expect(cfg.review.reuse_pane).toBe(DEFAULTS.review.reuse_pane);
    expect(warnings).toHaveLength(0);
  });

  it("falls back to defaults on unparseable TOML", () => {
    writeFileSync(join(dir, "config.toml"), `not valid toml [[[`);
    expect(loadConfig(dir)).toEqual(DEFAULTS);
  });
});
