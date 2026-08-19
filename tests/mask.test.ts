import { describe, expect, it } from "vitest";
import { maskSecret } from "../src/mask.js";

describe("maskSecret", () => {
  it("replaces every occurrence of the secret", () => {
    expect(maskSecret("token=ghp_abc failed, retry with ghp_abc", "ghp_abc")).toBe(
      "token=*** failed, retry with ***",
    );
  });

  it("returns the text unchanged when there is no secret", () => {
    expect(maskSecret("nothing to hide here", undefined)).toBe("nothing to hide here");
    expect(maskSecret("nothing to hide here", "")).toBe("nothing to hide here");
  });

  it("returns the text unchanged when the secret does not appear", () => {
    expect(maskSecret("clean output", "ghp_abc")).toBe("clean output");
  });
});
