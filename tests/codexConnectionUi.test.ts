import { describe, expect, it } from "vitest";
import { codexConnectionPrimaryAction } from "../src/shared/codexConnectionUi";

describe("codex connection UI copy", () => {
  it("uses a single primary action and no disconnect choice", () => {
    const action = codexConnectionPrimaryAction();

    expect(action.label).toBe("一键读取全部 Codex 使用过程");
    expect(action.description).toContain("Codex session 元数据");
    expect(action.description).toContain("全局捕获脚本");
    expect(action.description).toContain("成长分析");
    expect(action.description).not.toContain("项目文件夹");
    expect(action.description).not.toContain("断开");
  });
});
