import { describe, expect, it } from "vitest";
import {
  buildWeeklyReport,
  calculateCodexBaseline,
  calculateAiCapabilityScore,
  capPurificationGain,
  calculateSessionReward,
  calculateSkillQualityScore,
  calculateSkillUsageImpact,
  classifySession,
  detectSkillsFromEvidence,
  inferGrowthArchetype,
  scorePromptClarity,
  stageForCodexReadiness,
  stageForPurification,
} from "../src/shared/rules";
import { visualStageForPet } from "../src/shared/petPresentation";
import type { PetState, SessionStatus } from "../src/shared/types";

describe("session classification", () => {
  it.each<[string, Parameters<typeof classifySession>[0], SessionStatus]>([
    [
      "inactive when nothing changed and no proof exists",
      {
        changedFilesCount: 0,
        successfulCommands: 0,
        buildSuccess: false,
        testSuccess: false,
        gitCommitCreated: false,
        detectedSkills: [],
      },
      "inactive",
    ],
    [
      "unverified when files changed without successful commands or delivery proof",
      {
        changedFilesCount: 3,
        successfulCommands: 0,
        buildSuccess: false,
        testSuccess: false,
        gitCommitCreated: false,
        detectedSkills: [],
      },
      "unverified",
    ],
    [
      "working when files changed and at least one command succeeded",
      {
        changedFilesCount: 2,
        successfulCommands: 1,
        buildSuccess: false,
        testSuccess: false,
        gitCommitCreated: false,
        detectedSkills: [],
      },
      "working",
    ],
    [
      "delivered when there are at least two delivery proofs",
      {
        changedFilesCount: 2,
        successfulCommands: 2,
        buildSuccess: false,
        testSuccess: false,
        gitCommitCreated: false,
        detectedSkills: [],
        promptClarityScore: 80,
      },
      "delivered",
    ],
    [
      "inactive when commands ran but no project change exists",
      {
        changedFilesCount: 0,
        successfulCommands: 3,
        buildSuccess: true,
        testSuccess: true,
        gitCommitCreated: false,
        detectedSkills: [],
        promptClarityScore: 90,
      },
      "inactive",
    ],
    [
      "breakthrough only when delivery, skill, build/test proof, and clear prompt all exist",
      {
        changedFilesCount: 2,
        successfulCommands: 2,
        buildSuccess: true,
        testSuccess: false,
        gitCommitCreated: false,
        detectedSkills: ["electron"],
        promptClarityScore: 82,
      },
      "breakthrough",
    ],
    [
      "delivered instead of breakthrough when prompt is unclear",
      {
        changedFilesCount: 2,
        successfulCommands: 2,
        buildSuccess: true,
        testSuccess: false,
        gitCommitCreated: false,
        detectedSkills: ["electron"],
        promptClarityScore: 40,
      },
      "delivered",
    ],
  ])("%s", (_name, input, expected) => {
    expect(classifySession(input)).toBe(expected);
  });
});

describe("growth rewards and stages", () => {
  it("keeps exp and purification separated", () => {
    expect(
      calculateSessionReward({
        status: "breakthrough",
        successfulCommands: 2,
        buildSuccess: true,
        testSuccess: true,
        gitCommitCreated: true,
        newSkillCount: 1,
      }),
    ).toEqual({ exp: 25, purification: 3 });
    expect(
      calculateSessionReward({
        status: "delivered",
        successfulCommands: 2,
        buildSuccess: true,
        testSuccess: false,
        gitCommitCreated: false,
        newSkillCount: 0,
      }),
    ).toEqual({ exp: 15, purification: 1 });
    expect(
      calculateSessionReward({
        status: "working",
        successfulCommands: 1,
        buildSuccess: false,
        testSuccess: false,
        gitCommitCreated: false,
        newSkillCount: 0,
      }),
    ).toEqual({ exp: 5, purification: 0 });
  });

  it("caps purification growth per day and week", () => {
    expect(
      capPurificationGain({
        requested: 4,
        dailyEarned: 3,
        weeklyEarned: 10,
      }),
    ).toBe(2);
    expect(
      capPurificationGain({
        requested: 3,
        dailyEarned: 5,
        weeklyEarned: 8,
      }),
    ).toBe(0);
    expect(
      capPurificationGain({
        requested: 6,
        dailyEarned: 0,
        weeklyEarned: 14,
      }),
    ).toBe(1);
  });

  it.each([
    [0, "egg"],
    [30, "egg"],
    [31, "chaos"],
    [100, "chaos"],
    [101, "apprentice"],
    [220, "apprentice"],
    [221, "maker"],
    [400, "maker"],
    [401, "mage"],
    [700, "mage"],
    [701, "creator"],
  ] as const)("maps %i purification to %s", (score, stage) => {
    expect(stageForPurification(score)).toBe(stage);
  });

  it("maps local Codex readiness to a non-growth visual baseline stage", () => {
    expect(stageForCodexReadiness(0)).toBe("egg");
    expect(stageForCodexReadiness(20)).toBe("chaos");
    expect(stageForCodexReadiness(52)).toBe("apprentice");
    expect(stageForCodexReadiness(76)).toBe("maker");
  });

  it("does not let Codex readiness change the pet growth stage before real sessions", () => {
    const petState: PetState = {
      stage: "egg",
      baselineStage: "maker",
      archetype: "balanced",
      exp: 0,
      purificationScore: 0,
      aiCapabilityScore: 0,
      currentMood: "",
      unlockedItems: [],
      lastActiveDate: "",
      codexBaseline: null,
    };

    expect(visualStageForPet(petState, [])).toBe("egg");
  });
});

describe("skill scoring", () => {
  it("does not reward detection alone and only gives small session-based skill growth", () => {
    expect(calculateSkillUsageImpact("inactive")).toEqual({
      exp: 0,
      purification: 0,
      usageScore: 1,
    });
    expect(calculateSkillUsageImpact("working")).toEqual({
      exp: 0,
      purification: 0,
      usageScore: 1,
    });
    expect(calculateSkillUsageImpact("delivered")).toEqual({
      exp: 3,
      purification: 0,
      usageScore: 5,
    });
    expect(calculateSkillUsageImpact("breakthrough")).toEqual({
      exp: 5,
      purification: 1,
      usageScore: 10,
    });
  });

  it("scores GitHub skill quality separately from user growth", () => {
    expect(
      calculateSkillQualityScore({
        stars: 1200,
        forks: 120,
        openIssues: 35,
        lastPushedAt: "2026-05-01T00:00:00.000Z",
        hasReadme: true,
        hasExamples: true,
        hasLicense: true,
        repoAgeDays: 900,
      }),
    ).toBeGreaterThanOrEqual(75);

    expect(
      calculateSkillQualityScore({
        stars: 0,
        forks: 0,
        openIssues: 0,
        lastPushedAt: null,
        hasReadme: false,
        hasExamples: false,
        hasLicense: false,
        repoAgeDays: 0,
      }),
    ).toBe(0);
  });
});

describe("prompt clarity and capability score", () => {
  it("rewards goals with scope, stack, constraints, and acceptance criteria", () => {
    const high =
      "只修改移动端首页，使用 React 和 Tailwind，打开页面后直接展示项目卡片，不要重构数据结构。完成后 npm run build 通过并给我验收清单。";
    const low = "帮我优化一下";

    expect(scorePromptClarity(high)).toBeGreaterThanOrEqual(80);
    expect(scorePromptClarity(low)).toBeLessThanOrEqual(30);
    expect(scorePromptClarity("改一下首页")).toBeLessThanOrEqual(40);
  });

  it("calculates strict growth score from real delivery and verification signals only", () => {
    expect(
      calculateAiCapabilityScore({
        deliveryScore: 60,
        verificationScore: 80,
        promptClarityScore: 70,
        repairScore: 100,
        masteredToolScore: 40,
      }),
    ).toBe(71);
  });
});

describe("Codex local baseline", () => {
  it("calibrates a non-zero starting level from local Codex metadata without session rewards", () => {
    const baseline = calculateCodexBaseline({
      codexHomePresent: true,
      configPresent: true,
      customSkillCount: 12,
      pluginSkillCount: 48,
      bundledSkillCount: 4,
    });

    expect(baseline.aiCapabilityScore).toBeGreaterThanOrEqual(55);
    expect(baseline.purificationFloor).toBe(0);
    expect(baseline.expFloor).toBe(0);
    expect(baseline.summary).toContain("本地 Codex");
  });

  it("keeps baseline conservative when no Codex metadata exists", () => {
    expect(
      calculateCodexBaseline({
        codexHomePresent: false,
        configPresent: false,
        customSkillCount: 0,
        pluginSkillCount: 0,
        bundledSkillCount: 0,
      }),
    ).toMatchObject({
      aiCapabilityScore: 0,
      purificationFloor: 0,
      expFloor: 0,
    });
  });
});

describe("growth archetype", () => {
  it("infers prompt master when recent task goals are consistently clear", () => {
    expect(
      inferGrowthArchetype([
        {
          status: "delivered",
          buildSuccess: true,
          testSuccess: false,
          promptClarityScore: 95,
          detectedSkills: [],
          addedFilesCount: 1,
          newDependencies: [],
          gitCommitCreated: false,
          commandsRun: [],
        },
      ]),
    ).toBe("prompt_master");
  });
});

describe("skill detection and weekly reports", () => {
  it("detects supported skills from dependency and file evidence", () => {
    expect(
      detectSkillsFromEvidence({
        dependencies: ["electron", "vite", "tailwindcss", "vitest"],
        filePaths: [
          "src/main/main.ts",
          "vite.config.ts",
          "tailwind.config.js",
          "src/App.test.tsx",
          ".github/workflows/ci.yml",
          ".env.example",
        ],
        contentSignals: ["localStorage", "@media", "sm:"],
      }).map((skill) => skill.skillId),
    ).toEqual([
      "electron-desktop",
      "vite",
      "tailwind",
      "testing",
      "responsive",
      "local-storage",
      "ci-cd",
      "env-management",
    ]);
  });

  it("reports an upward 7-day trend when two or more signals improve", () => {
    const report = buildWeeklyReport({
      period: "weekly",
      startDate: "2026-05-17",
      endDate: "2026-05-23",
      currentSessions: [
        {
          status: "working",
          buildSuccess: false,
          testSuccess: false,
          promptClarityScore: 80,
          detectedSkills: [],
        },
        {
          status: "breakthrough",
          buildSuccess: true,
          testSuccess: false,
          promptClarityScore: 85,
          detectedSkills: ["electron-desktop"],
        },
      ],
      previousSessions: [
        {
          status: "inactive",
          buildSuccess: false,
          testSuccess: false,
          promptClarityScore: 20,
          detectedSkills: [],
        },
      ],
      aiCapabilityScore: 55,
    });

    expect(report.trend).toBe("up");
    expect(report.period).toBe("weekly");
    expect(report.reportId).toBe("weekly_2026-05-17_2026-05-23");
    expect(report.effectiveSessions).toBe(2);
    expect(report.inactiveSessions).toBe(0);
    expect(report.newSkills).toBe(1);
    expect(report.summary).toContain("本周上升");
  });

  it("creates a daily ability report with daily wording", () => {
    const report = buildWeeklyReport({
      period: "daily",
      startDate: "2026-05-23",
      endDate: "2026-05-23",
      currentSessions: [
        {
          status: "delivered",
          buildSuccess: true,
          testSuccess: false,
          promptClarityScore: 76,
          detectedSkills: [],
        },
      ],
      previousSessions: [],
      aiCapabilityScore: 48,
    });

    expect(report.period).toBe("daily");
    expect(report.reportId).toBe("daily_2026-05-23_2026-05-23");
    expect(report.summary).toContain("今日上升");
    expect(report.deliveredSessions).toBe(1);
  });

  it("turns daily report evidence into usage habits and optimization advice", () => {
    const report = buildWeeklyReport({
      period: "daily",
      startDate: "2026-05-24",
      endDate: "2026-05-24",
      currentSessions: [
        {
          status: "inactive",
          buildSuccess: false,
          testSuccess: false,
          promptClarityScore: 18,
          detectedSkills: [],
        },
        {
          status: "unverified",
          buildSuccess: false,
          testSuccess: false,
          promptClarityScore: 42,
          detectedSkills: [],
        },
      ],
      previousSessions: [],
      aiCapabilityScore: 12,
    });

    expect(report.habitSummary).toContain("没有形成交付闭环");
    expect(report.optimizationAdvice).toContain("结束前");
    expect(report.nextPractice).toContain("目标");
    expect(report.habitSummary).not.toMatch(/build|test|git|commit/i);
    expect(report.optimizationAdvice).not.toMatch(/build|test|git|commit/i);
  });

  it("recognizes clearer delivered behavior without exposing technical report wording", () => {
    const report = buildWeeklyReport({
      period: "daily",
      startDate: "2026-05-24",
      endDate: "2026-05-24",
      currentSessions: [
        {
          status: "delivered",
          buildSuccess: true,
          testSuccess: false,
          promptClarityScore: 86,
          detectedSkills: [],
        },
        {
          status: "working",
          buildSuccess: false,
          testSuccess: false,
          promptClarityScore: 78,
          detectedSkills: [],
        },
      ],
      previousSessions: [],
      aiCapabilityScore: 45,
    });

    expect(report.habitSummary).toContain("会把目标说清楚");
    expect(report.habitSummary).toContain("完成闭环");
    expect(report.optimizationAdvice).toContain("复盘");
    expect(report.nextPractice).toContain("验收标准");
    expect(report.habitSummary).not.toMatch(/build|test|git|commit/i);
  });
});
