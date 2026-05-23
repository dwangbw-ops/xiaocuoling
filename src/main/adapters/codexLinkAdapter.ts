import { execFile } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { analyzeCodexHookSession } from "../codex/codexSessionAnalyzer";
import {
  installGlobalCodexHooks,
  installCodexHooks,
  normalizeHookPayload,
  sanitizeCommandSummary,
} from "../codex/codexHooksManager";
import { readCodexHookEvents } from "../codex/codexEventStore";
import { importCodexSessionHistory } from "../codex/codexHistoryImporter";
import type {
  CodexCapabilityAnalysis,
  CodexConfigSignals,
  CodexEventEvidence,
  CodexHookEvent,
  CodexHookEventName,
  CodexLinkStatus,
} from "../../shared/types";

export { sanitizeCommandSummary };

export function normalizeCodexHookPayload(payload: Record<string, unknown>): CodexHookEvent {
  return normalizeHookPayload(payload);
}

export function convertHookEventsToEvidence(events: CodexHookEvent[]): CodexEventEvidence {
  return analyzeCodexHookSession(events);
}

export function extractCodexConfigSignals(content: string): CodexConfigSignals {
  const mcpServerNames = [...content.matchAll(/^\s*\[mcp_servers\.([^\]\s]+)\]\s*$/gim)]
    .map((match) => match[1])
    .filter(Boolean)
    .sort();

  return {
    hasModel: /^\s*model\s*=/im.test(content),
    hasApprovalPolicy: /^\s*approval_policy\s*=/im.test(content),
    hasSandboxMode: /^\s*sandbox_mode\s*=/im.test(content),
    hasMcpServers: mcpServerNames.length > 0,
    hasHooksReference: /hook|hooks|SessionStart|PreToolUse|PostToolUse|UserPromptSubmit/im.test(content),
    mcpServerNames,
  };
}

export async function analyzeCodexCapabilities(input: {
  codexHome: string;
  eventLogPath: string;
  projectPath?: string | null;
  codexVersion?: string;
}): Promise<CodexCapabilityAnalysis> {
  const codexVersion =
    typeof input.codexVersion === "string" ? input.codexVersion : await getCodexVersion();
  const codexHomePresent = existsSync(input.codexHome);
  const configPath = path.join(input.codexHome, "config.toml");
  const agentsPath = path.join(input.codexHome, "AGENTS.md");
  const configContent = await readTextIfExists(configPath);
  const customSkillNames = await listDirectSkillNames(path.join(input.codexHome, "skills"), false);
  const bundledSkillNames = await listDirectSkillNames(
    path.join(input.codexHome, "skills", ".system"),
    true,
  );
  const pluginSkillNames = await listPluginSkillNames(path.join(input.codexHome, "plugins", "cache"));
  const pluginNames = await listPluginNames(path.join(input.codexHome, "plugins", "cache"));
  const events = await readCodexHookEvents(input.eventLogPath, 100);
  const commandEvents = events.filter((event) => event.commandSummary);
  const projectHookPath = input.projectPath
    ? path.join(input.projectPath, ".codex", "hooks", "xiaocuoling-capture.js")
    : "";
  const globalHookPath = path.join(input.codexHome, "hooks", "xiaocuoling-capture.js");

  const totalSkills =
    customSkillNames.length + bundledSkillNames.length + pluginSkillNames.length;
  const readinessScore = clamp(
    Math.round(
      (codexVersion ? 16 : 0) +
        (codexHomePresent ? 12 : 0) +
        (configContent ? 12 : 0) +
        Math.min(30, totalSkills * 1.2) +
        Math.min(14, pluginNames.length * 2) +
        Math.min(10, events.length * 0.8) +
        ((projectHookPath && existsSync(projectHookPath)) || existsSync(globalHookPath) ? 6 : 0),
    ),
    0,
    100,
  );

  return {
    capturedAt: new Date().toISOString(),
    codexHome: input.codexHome,
    codexCliDetected: Boolean(codexVersion),
    codexVersion,
    codexHomePresent,
    configPresent: Boolean(configContent),
    agentsPresent: existsSync(agentsPath),
    projectHookReady: Boolean(
      (projectHookPath && existsSync(projectHookPath)) || existsSync(globalHookPath),
    ),
    projectPath: input.projectPath ?? "",
    inventory: {
      totalSkills,
      customSkillCount: customSkillNames.length,
      bundledSkillCount: bundledSkillNames.length,
      pluginSkillCount: pluginSkillNames.length,
      pluginCount: pluginNames.length,
      customSkillNames,
      bundledSkillNames,
      pluginSkillNames,
      pluginNames,
    },
    config: extractCodexConfigSignals(configContent),
    recentHooks: {
      eventCount: events.length,
      sessionStarts: events.filter((event) => event.hookEventName === "SessionStart").length,
      toolUses: events.filter(
        (event) => event.hookEventName === "PreToolUse" || event.hookEventName === "PostToolUse",
      ).length,
      buildRuns: commandEvents.filter((event) => event.commandSummary.includes("build")).length,
      testRuns: commandEvents.filter((event) => /(test|vitest|jest)/.test(event.commandSummary))
        .length,
      gitCommands: commandEvents.filter((event) => event.commandSummary.startsWith("git ")).length,
      latestEventAt: events[0]?.timestamp ?? null,
    },
    privacy: {
      promptContentStored: false,
      codeContentStored: false,
      terminalOutputStored: false,
      uploadsData: false,
    },
    readinessScore,
    summary: buildCapabilitySummary(totalSkills, pluginNames.length, events.length, readinessScore),
  };
}

export class CodexLinkAdapter {
  constructor(
    private readonly codexHome: string,
    private readonly eventLogPath: string,
  ) {}

  async getStatus(projectPath: string | null): Promise<CodexLinkStatus> {
    const version = await getCodexVersion();
    const projectHookPath = projectPath
      ? path.join(projectPath, ".codex", "hooks", "xiaocuoling-capture.js")
      : "";
    const globalHookPath = path.join(this.codexHome, "hooks", "xiaocuoling-capture.js");
    const projectHooksCanInstall = projectPath ? await canWrite(projectPath) : false;
    const projectHooksInstalled = Boolean(
      existsSync(globalHookPath) || (projectHookPath && existsSync(projectHookPath)),
    );
    const events = await readCodexHookEvents(this.eventLogPath, 50);
    const latest = events[0] ?? null;
    const capabilityAnalysis = await analyzeCodexCapabilities({
      codexHome: this.codexHome,
      eventLogPath: this.eventLogPath,
      projectPath,
      codexVersion: version,
    });
    return {
      codexCliDetected: Boolean(version),
      codexVersion: version,
      configPath: this.codexHome,
      configExists:
        existsSync(path.join(this.codexHome, "config.toml")) ||
        existsSync(path.join(this.codexHome, "AGENTS.md")),
      projectHooksCanInstall,
      projectHooksInstalled,
      projectHookPath: projectHookPath || globalHookPath,
      recentEventCount: events.length,
      latestEventAt: latest?.timestamp ?? null,
      latestSessionId: latest?.sessionId ?? "",
      connectionMode: projectHooksInstalled || events.length > 0 ? "hooks" : "manual",
      privacyNotice:
        "小搓灵只记录 Codex session 元数据、工具调用摘要和本地项目变化，不读取完整 prompt、不上传数据。",
      capabilityAnalysis,
    };
  }

  async installProjectHooks(projectPath: string) {
    return installCodexHooks({
      projectPath,
      eventLogPath: this.eventLogPath,
    });
  }

  async installGlobalHooks() {
    const installResult = await installGlobalCodexHooks({
      codexHome: this.codexHome,
      eventLogPath: this.eventLogPath,
    });
    const importResult = await importCodexSessionHistory({
      codexHome: this.codexHome,
      eventLogPath: this.eventLogPath,
    });
    return { ...installResult, importResult };
  }

  async readRecentEvents(limit = 50): Promise<CodexHookEvent[]> {
    return readCodexHookEvents(this.eventLogPath, limit);
  }
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function listDirectSkillNames(root: string, includeHidden: boolean): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!includeHidden && entry.name.startsWith(".")) continue;
    if (existsSync(path.join(root, entry.name, "SKILL.md"))) {
      names.push(entry.name);
    }
  }
  return names.sort();
}

async function listPluginNames(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

async function listPluginSkillNames(root: string): Promise<string[]> {
  const names = new Set<string>();
  await walkForSkillFiles(root, names, 0);
  return [...names].sort();
}

async function walkForSkillFiles(root: string, names: Set<string>, depth: number) {
  if (depth > 8) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkForSkillFiles(fullPath, names, depth + 1);
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      const skillName = path.basename(path.dirname(fullPath));
      if (skillName && skillName !== "skills") names.add(skillName);
    }
  }
}

function buildCapabilitySummary(
  totalSkills: number,
  pluginCount: number,
  eventCount: number,
  readinessScore: number,
): string {
  return `已连接并分析本机 Codex：识别到 ${totalSkills} 个 Codex 工具入口、${pluginCount} 个 Plugin / Skill 来源、${eventCount} 条 hook 元数据。环境就绪度 ${readinessScore}/100。工具入口只代表环境可用，不代表你已经掌握；真正成长来自真实 Session、运行验证和交付闭环。`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function canWrite(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeHookName(value: string): CodexHookEventName {
  const allowed = new Set(["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]);
  return allowed.has(value) ? (value as CodexHookEventName) : "Unknown";
}

function getCodexVersion(): Promise<string> {
  return new Promise((resolve) => {
    execFile("codex", ["--version"], { timeout: 5_000 }, (error, stdout, stderr) => {
      if (error) {
        resolve("");
        return;
      }
      resolve((stdout || stderr).trim());
    });
  });
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
