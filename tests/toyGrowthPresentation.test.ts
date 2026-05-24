import { describe, expect, it } from "vitest";
import { buildToyGrowthPresentation } from "../src/shared/toyGrowthPresentation";
import type { AppSnapshot, CodexSessionRecord } from "../src/shared/types";

const baseSession: CodexSessionRecord = {
  sessionId: "s1",
  projectId: "p1",
  projectPath: "/Users/wangdingwen/Documents/离谱 MVP 雷达",
  taskGoal: "做一个 content 离谱 MVP 雷达，针对 UI 进行整改，针对功能补齐推荐逻辑。",
  startTime: "2026-05-24T10:00:00.000Z",
  endTime: "2026-05-24T10:30:00.000Z",
  duration: 1800000,
  beforeCommitHash: "",
  beforeGitStatus: "",
  beforePackageJsonDependencies: [],
  beforeFileSnapshot: {},
  afterCommitHash: "",
  afterGitStatus: "",
  afterPackageJsonDependencies: [],
  afterFileSnapshot: {},
  changedFilesCount: 3,
  addedFilesCount: 0,
  deletedFilesCount: 0,
  modifiedFilesCount: 3,
  newDependencies: [],
  detectedSkills: [],
  commandsRun: [],
  successfulCommands: 2,
  failedCommands: 0,
  buildSuccess: true,
  testSuccess: false,
  gitCommitCreated: false,
  status: "delivered",
  score: 15,
  promptClarityScore: 82,
  feedback: "这次有交付证据，我只亮一点。",
};

function makeSnapshot(sessions: CodexSessionRecord[]): AppSnapshot {
  return {
    projects: [],
    sessions,
    skills: [],
    petState: {
      stage: "egg",
      baselineStage: "egg",
      archetype: "balanced",
      exp: 20,
      purificationScore: 12,
      aiCapabilityScore: 31,
      currentMood: "你有 Codex 基础，但我还没看到真实交付。",
      unlockedItems: [],
      lastActiveDate: "2026-05-24T00:00:00.000Z",
      codexBaseline: null,
    },
    weeklyReports: [],
    githubSkillRecommendations: {
      fetchedAt: null,
      source: "github-api",
      query: "",
      minStars: 100,
      recommendations: [],
      error: null,
    },
    activeSession: null,
    codexLink: null,
  };
}

describe("toy growth presentation", () => {
  it("does not fabricate growth when there is no completed session", () => {
    const presentation = buildToyGrowthPresentation(makeSnapshot([]));

    expect(presentation.growthScore).toBe("暂无");
    expect(presentation.recentMemory).toBeNull();
    expect(presentation.feedback).toBe("你有 Codex 基础，但我还没看到真实交付。");
  });

  it("summarizes the latest real delivery as a growth memory", () => {
    const presentation = buildToyGrowthPresentation(makeSnapshot([baseSession]));

    expect(presentation.growthScore).toBe(31);
    expect(presentation.recentMemory).toEqual({
      project: "离谱 MVP 雷达",
      goal: "content 离谱 MVP 雷达",
      items: ["UI 整改：调整界面、层级或展示方式", "功能整改：补齐读取、分析或推荐逻辑", "结果：已留下可验证结果"],
    });
  });
});
