import os from "node:os";
import fs from "node:fs";
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

  it("does not ship demo snapshots or fabricated report fallbacks", () => {
    const renderer = fs.readFileSync(
      path.join(process.cwd(), "src", "renderer", "App.tsx"),
      "utf8",
    );

    expect(renderer).not.toContain("demoSnapshot");
    expect(renderer).not.toContain("browserDemoApi");
    expect(renderer).not.toContain("公开展示版");
    expect(renderer).not.toContain("fallbackHabitSummary");
    expect(renderer).not.toContain("fallbackOptimizationAdvice");
    expect(renderer).not.toContain("fallbackNextPractice");
    expect(renderer).not.toContain("检测到工具 ≠ 掌握工具");
    expect(renderer).not.toContain("打开 Codex ≠ 有效成长");
    expect(renderer).not.toContain("工具入口不等于能力");
  });
});
