import { describe, expect, it } from "vitest";
import { buildCapabilitySections } from "../src/shared/capabilityDisplay";
import type { CodexCapabilityAnalysis } from "../src/shared/types";

function makeAnalysis(): CodexCapabilityAnalysis {
  return {
    capturedAt: "2026-05-23T07:00:00.000Z",
    codexHome: "/Users/example/.codex",
    codexCliDetected: true,
    codexVersion: "codex 1.0.0",
    codexHomePresent: true,
    configPresent: true,
    agentsPresent: true,
    projectHookReady: false,
    projectPath: "/repo",
    inventory: {
      totalSkills: 6,
      customSkillCount: 3,
      bundledSkillCount: 1,
      pluginSkillCount: 2,
      pluginCount: 2,
      customSkillNames: ["alpha", "beta", "gamma"],
      bundledSkillNames: ["system-a"],
      pluginSkillNames: ["plugin-a", "plugin-b"],
      pluginNames: ["github", "vercel"],
    },
    config: {
      hasModel: true,
      hasApprovalPolicy: true,
      hasSandboxMode: true,
      hasMcpServers: true,
      hasHooksReference: false,
      mcpServerNames: ["github", "vercel"],
    },
    recentHooks: {
      eventCount: 4,
      sessionStarts: 1,
      toolUses: 2,
      buildRuns: 1,
      testRuns: 0,
      gitCommands: 1,
      latestEventAt: "2026-05-23T07:00:00.000Z",
    },
    privacy: {
      promptContentStored: false,
      codeContentStored: false,
      terminalOutputStored: false,
      uploadsData: false,
    },
    readinessScore: 76,
    summary: "ready",
  };
}

describe("capability display", () => {
  it("keeps every capability name grouped by source without truncating", () => {
    const sections = buildCapabilitySections(makeAnalysis());

    expect(sections.map((section) => section.title)).toEqual([
      "自定义 Skills",
      "插件 Skills",
      "系统 Skills",
      "Plugin / Skill 来源",
      "MCP 配置",
      "配置结构",
      "Hooks 证据",
      "本地连接",
    ]);
    expect(sections.flatMap((section) => section.items)).toEqual(
      expect.arrayContaining(["alpha", "beta", "gamma", "plugin-a", "plugin-b", "system-a"]),
    );
    expect(sections.flatMap((section) => section.items)).toEqual(
      expect.arrayContaining([
        "model 已配置",
        "approval_policy 已配置",
        "sandbox_mode 已配置",
        "Codex Home /Users/example/.codex",
        "项目 /repo",
      ]),
    );
    expect(sections.flatMap((section) => section.items)).toHaveLength(22);
  });
});
