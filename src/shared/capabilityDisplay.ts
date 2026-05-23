import type { CodexCapabilityAnalysis } from "./types";

export interface CapabilityDisplaySection {
  title: string;
  count: number;
  items: string[];
}

export function buildCapabilitySections(
  analysis: CodexCapabilityAnalysis,
): CapabilityDisplaySection[] {
  return [
    {
      title: "自定义 Skills",
      count: analysis.inventory.customSkillCount,
      items: analysis.inventory.customSkillNames,
    },
    {
      title: "插件 Skills",
      count: analysis.inventory.pluginSkillCount,
      items: analysis.inventory.pluginSkillNames,
    },
    {
      title: "系统 Skills",
      count: analysis.inventory.bundledSkillCount,
      items: analysis.inventory.bundledSkillNames,
    },
    {
      title: "Plugin / Skill 来源",
      count: analysis.inventory.pluginCount,
      items: analysis.inventory.pluginNames,
    },
    {
      title: "MCP 配置",
      count: analysis.config.mcpServerNames.length,
      items: analysis.config.mcpServerNames,
    },
    {
      title: "配置结构",
      count: [
        analysis.config.hasModel,
        analysis.config.hasApprovalPolicy,
        analysis.config.hasSandboxMode,
        analysis.config.hasHooksReference,
      ].filter(Boolean).length,
      items: [
        analysis.config.hasModel ? "model 已配置" : "model 未检测",
        analysis.config.hasApprovalPolicy ? "approval_policy 已配置" : "approval_policy 未检测",
        analysis.config.hasSandboxMode ? "sandbox_mode 已配置" : "sandbox_mode 未检测",
        analysis.config.hasHooksReference ? "hooks 引用已配置" : "hooks 引用未检测",
      ],
    },
    {
      title: "Hooks 证据",
      count: analysis.recentHooks.eventCount,
      items: [
        `事件 ${analysis.recentHooks.eventCount}`,
        `SessionStart ${analysis.recentHooks.sessionStarts}`,
        `ToolUse ${analysis.recentHooks.toolUses}`,
        `Build/Test/Git ${analysis.recentHooks.buildRuns}/${analysis.recentHooks.testRuns}/${analysis.recentHooks.gitCommands}`,
      ],
    },
    {
      title: "本地连接",
      count: analysis.readinessScore,
      items: [
        `CLI ${analysis.codexVersion || "未检测"}`,
        `Codex Home ${analysis.codexHomePresent ? analysis.codexHome : "未检测"}`,
        `项目 ${analysis.projectPath || "未选择"}`,
        `Config/AGENTS/Hooks ${analysis.configPresent ? "有" : "无"}/${analysis.agentsPresent ? "有" : "无"}/${analysis.projectHookReady ? "有" : "无"}`,
      ],
    },
  ];
}
