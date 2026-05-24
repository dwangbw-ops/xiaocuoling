import { describe, expect, it } from "vitest";
import { buildSessionNarrative } from "../src/shared/sessionNarrative";
import type { CodexSessionRecord } from "../src/shared/types";

const baseSession: CodexSessionRecord = {
  sessionId: "s1",
  projectId: "p1",
  projectPath: "/Users/wangdingwen/Documents/小搓灵",
  taskGoal: "把日报改成使用习惯复盘，不展示技术细节。",
  startTime: "2026-05-24T05:00:00.000Z",
  endTime: "2026-05-24T05:20:00.000Z",
  duration: 1200000,
  beforeCommitHash: "",
  beforeGitStatus: "",
  beforePackageJsonDependencies: [],
  beforeFileSnapshot: {},
  afterCommitHash: "",
  afterGitStatus: "",
  afterPackageJsonDependencies: [],
  afterFileSnapshot: {},
  changedFilesCount: 3,
  addedFilesCount: 1,
  deletedFilesCount: 0,
  modifiedFilesCount: 2,
  newDependencies: [],
  detectedSkills: [],
  commandsRun: [
    {
      command: "npm test",
      startTime: "2026-05-24T05:15:00.000Z",
      endTime: "2026-05-24T05:15:10.000Z",
      exitCode: 0,
      success: true,
      outputSummary: "summary",
    },
  ],
  successfulCommands: 1,
  failedCommands: 0,
  buildSuccess: false,
  testSuccess: true,
  gitCommitCreated: false,
  status: "delivered",
  score: 15,
  promptClarityScore: 82,
  feedback: "真实反馈",
};

describe("session narrative", () => {
  it("describes the real project and work evidence without fabricated filler", () => {
    const narrative = buildSessionNarrative(baseSession);

    expect(narrative.projectName).toBe("小搓灵");
    expect(narrative.goal).toBe("把日报改成使用习惯复盘，不展示技术细节。");
    expect(narrative.items).toContain("文件变化：3 个文件（新增 1，修改 2，删除 0）");
    expect(narrative.items).toContain("运行命令：npm test（成功）");
    expect(narrative.items).toContain("验证结果：测试通过");
    expect(narrative.items.join(" ")).not.toContain("工具入口不等于能力");
    expect(narrative.items.join(" ")).not.toContain("检测到工具");
  });

  it("does not invent a task goal when Codex history only has metadata", () => {
    const narrative = buildSessionNarrative({
      ...baseSession,
      taskGoal: "Codex 全局历史使用过程（仅保存元数据，不保存完整 prompt）",
      projectPath: "",
      changedFilesCount: 0,
      addedFilesCount: 0,
      modifiedFilesCount: 0,
      commandsRun: [],
      successfulCommands: 0,
      testSuccess: false,
      status: "inactive",
    });

    expect(narrative.projectName).toBe("未记录项目");
    expect(narrative.goal).toBe("未记录任务目标");
    expect(narrative.items).toEqual(["未记录具体操作"]);
  });
});
