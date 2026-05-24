import { describe, expect, it } from "vitest";
import { buildSessionNarrative } from "../src/shared/sessionNarrative";
import type { CodexSessionRecord } from "../src/shared/types";

const baseSession: CodexSessionRecord = {
  sessionId: "s1",
  projectId: "p1",
  projectPath: "/Users/wangdingwen/Documents/小搓灵",
  taskGoal:
    "做一个 content 离谱 MVP 雷达，针对 UI 进行整改，针对功能补齐推荐逻辑，不要出现 document 技术细节。",
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
  it("summarizes the project theme and meaningful improvements instead of technical noise", () => {
    const narrative = buildSessionNarrative(baseSession);

    expect(narrative.projectName).toBe("小搓灵");
    expect(narrative.goal).toBe("content 离谱 MVP 雷达");
    expect(narrative.items).toContain("UI 整改：调整界面、层级或展示方式");
    expect(narrative.items).toContain("功能整改：补齐读取、分析或推荐逻辑");
    expect(narrative.items).toContain("数据整改：保留真实记录，过滤无意义细节");
    expect(narrative.items).toContain("结果：已留下可验证结果");
    expect(narrative.items.join(" ")).not.toMatch(/文件变化|运行命令|npm|document|SKILL/i);
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
    expect(narrative.goal).toBe("未记录任务主题");
    expect(narrative.items).toEqual(["未记录有效整改方向"]);
  });
});
