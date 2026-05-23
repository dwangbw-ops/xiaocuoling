import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isUnsafeProjectRoot } from "../src/main/projectIntrospection";

describe("project safety guard", () => {
  it("rejects broad user folders that would exhaust file watchers", () => {
    expect(isUnsafeProjectRoot(path.join(os.homedir(), "Documents"))).toBe(true);
    expect(isUnsafeProjectRoot(path.join(os.homedir(), "Desktop"))).toBe(true);
    expect(isUnsafeProjectRoot(os.homedir())).toBe(true);
  });

  it("allows a specific project folder", () => {
    expect(
      isUnsafeProjectRoot(path.join(os.homedir(), "Documents", "小搓灵")),
    ).toBe(false);
  });
});
