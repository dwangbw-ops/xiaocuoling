import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { summarizeTaskTheme } from "../../shared/taskSummary";
import type { CodexHookEvent, CodexHookEventName } from "../../shared/types";

export interface InstallCodexHooksInput {
  projectPath: string;
  eventLogPath: string;
}

export interface InstallCodexHooksResult {
  installed: boolean;
  hookPath: string;
}

const secretPattern =
  /((?:api[_-]?key|token|password|secret|authorization)\s*(?:[=:]\s*|\s+))['"]?[^'"\s]+/gi;

export async function installCodexHooks(
  input: InstallCodexHooksInput,
): Promise<InstallCodexHooksResult> {
  const hookDir = path.join(input.projectPath, ".codex", "hooks");
  const hookPath = path.join(hookDir, "xiaocuoling-capture.js");
  await mkdir(hookDir, { recursive: true });
  await writeFile(hookPath, generateCodexHookScript(input.eventLogPath), "utf8");
  await chmod(hookPath, 0o755);
  return { installed: true, hookPath };
}

export async function installGlobalCodexHooks(input: {
  codexHome: string;
  eventLogPath: string;
}): Promise<InstallCodexHooksResult> {
  const hookDir = path.join(input.codexHome, "hooks");
  const hookPath = path.join(hookDir, "xiaocuoling-capture.js");
  await mkdir(hookDir, { recursive: true });
  await writeFile(hookPath, generateCodexHookScript(input.eventLogPath), "utf8");
  await chmod(hookPath, 0o755);
  return { installed: true, hookPath };
}

export function sanitizeCommandSummary(command: unknown): string {
  if (typeof command !== "string" || !command.trim()) return "";
  const redacted = command.replace(secretPattern, "$1[redacted]");
  const lower = redacted.toLowerCase();
  const knownCommands = [
    "npm run build",
    "npm run dev",
    "npm test",
    "git status",
    "git diff --stat",
    "git log --oneline -5",
    "git commit",
  ];
  const matched = knownCommands.find((item) => lower.includes(item));
  if (matched) return matched;
  if (lower.includes("pnpm build")) return "pnpm build";
  if (lower.includes("pnpm test")) return "pnpm test";
  if (lower.includes("yarn build")) return "yarn build";
  if (lower.includes("yarn test")) return "yarn test";
  if (lower.includes("vitest")) return "vitest";
  if (lower.includes("jest")) return "jest";
  if (lower.includes("tsc")) return "tsc";
  return redacted.split(/\s+/).slice(0, 4).join(" ");
}

export function normalizeHookPayload(payload: Record<string, unknown>): CodexHookEvent {
  const hookEventName = normalizeHookName(
    firstString(payload, ["hookEventName", "hook_event_name", "event", "eventName"]),
  );
  const toolInput = asRecord(payload.toolInput ?? payload.tool_input ?? payload.input);
  const prompt = firstString(payload, ["prompt", "userPrompt", "user_prompt"]);
  const promptSummary = prompt ? summarizeTaskTheme(prompt) : "";
  const command =
    firstString(payload, ["command", "cmd"]) ||
    firstString(toolInput, ["command", "cmd"]);
  const commandSummary = sanitizeCommandSummary(command);
  const toolName =
    firstString(payload, ["toolName", "tool_name", "tool"]) ||
    firstString(asRecord(payload.tool), ["name"]) ||
    "";
  const exitCode = firstNumber(payload, ["exitCode", "exit_code", "status"]);
  const success =
    typeof payload.success === "boolean"
      ? payload.success
      : typeof exitCode === "number"
        ? exitCode === 0
        : undefined;
  const outputSummary = summarizeOutput(
    firstString(payload, ["output", "stdout", "stderr", "result", "error"]),
  );
  const promptClaritySignals = prompt
    ? {
        hasOnlyModify: /只\s*修改|只改|only/i.test(prompt),
        hasDoNot: /不要|不能|不允许|do not|don't/i.test(prompt),
        hasPreserve: /保留|保持|preserve|keep/i.test(prompt),
        hasAcceptance: /验收|通过|完成后|acceptance|verify/i.test(prompt),
        hasBuild: /build|构建/i.test(prompt),
        hasTest: /test|测试/i.test(prompt),
      }
    : undefined;
  const isEditIntent = isEditToolName(toolName);
  const isBuildCommand = /(^| )(npm|pnpm|yarn) (run )?build|tsc/.test(commandSummary);
  const isTestCommand = /(^| )(npm|pnpm|yarn) test|vitest|jest/.test(commandSummary);
  const isGitCommand = commandSummary.startsWith("git ");

  return {
    eventId: firstString(payload, ["eventId", "event_id"]) || createId("codex_event"),
    timestamp: firstString(payload, ["timestamp", "time"]) || new Date().toISOString(),
    hookEventName,
    sessionId: firstString(payload, ["sessionId", "session_id"]) || "",
    cwd: firstString(payload, ["cwd", "workingDirectory", "working_directory"]) || "",
    model: firstString(payload, ["model"]) || "",
    permissionMode:
      firstString(payload, ["permissionMode", "permission_mode"]) || "",
    source: firstString(payload, ["source"]) || "codex-hook",
    toolName,
    commandSummary,
    toolUseId: firstString(payload, ["toolUseId", "tool_use_id", "toolCallId"]) || "",
    turnId: firstString(payload, ["turnId", "turn_id"]) || "",
    ...(prompt
      ? {
          promptLength: prompt.length,
          ...(promptSummary ? { promptSummary } : {}),
          hasScopeWords: Boolean(promptClaritySignals?.hasOnlyModify || promptClaritySignals?.hasPreserve),
          hasAcceptanceCriteria: Boolean(
            promptClaritySignals?.hasAcceptance ||
              promptClaritySignals?.hasBuild ||
              promptClaritySignals?.hasTest,
          ),
          promptClaritySignals,
        }
      : {}),
    ...(typeof exitCode === "number" ? { exitCode } : {}),
    ...(typeof success === "boolean" ? { success } : {}),
    ...(outputSummary ? { outputSummary } : {}),
    isEditIntent,
    isBuildCommand,
    isTestCommand,
    isGitCommand,
    isBuildSuccess: Boolean(isBuildCommand && success),
    isTestSuccess: Boolean(isTestCommand && success),
    isGitSuccess: Boolean(isGitCommand && success),
    hasAssistantMessage:
      typeof payload.hasAssistantMessage === "boolean"
        ? payload.hasAssistantMessage
        : Boolean(firstString(payload, ["lastAssistantMessage", "last_assistant_message"])),
    stopHookActive: hookEventName === "Stop",
    transcriptPathExists: Boolean(firstString(payload, ["transcriptPath", "transcript_path"])),
  };
}

export function generateCodexHookScript(eventLogPath: string): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const EVENT_LOG_PATH = ${JSON.stringify(eventLogPath)};
const secretPattern = /((?:api[_-]?key|token|password|secret|authorization)\\s*(?:[=:]\\s*|\\s+))['"]?[^'"\\s]+/gi;

function firstString(source, keys) {
  for (const key of keys) {
    if (typeof source[key] === "string") return source[key];
  }
  return "";
}

function firstNumber(source, keys) {
  for (const key of keys) {
    if (typeof source[key] === "number") return source[key];
  }
  return undefined;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sanitizeCommandSummary(command) {
  if (typeof command !== "string" || !command.trim()) return "";
  const redacted = command.replace(secretPattern, "$1[redacted]");
  const lower = redacted.toLowerCase();
  const known = ["npm run build", "npm run dev", "npm test", "git status", "git diff --stat", "git log --oneline -5", "git commit"];
  const matched = known.find((item) => lower.includes(item));
  if (matched) return matched;
  if (lower.includes("pnpm build")) return "pnpm build";
  if (lower.includes("pnpm test")) return "pnpm test";
  if (lower.includes("yarn build")) return "yarn build";
  if (lower.includes("yarn test")) return "yarn test";
  if (lower.includes("vitest")) return "vitest";
  if (lower.includes("jest")) return "jest";
  if (lower.includes("tsc")) return "tsc";
  return redacted.split(/\\s+/).slice(0, 4).join(" ");
}

function summarizeTaskTheme(value) {
  if (typeof value !== "string") return "";
  const tick = String.fromCharCode(96);
  const fence = tick + tick + tick;
  let clean = value
    .replace(new RegExp(fence + "[\\\\s\\\\S]*?" + fence, "g"), " ")
    .replace(new RegExp(tick + "[^" + tick + "]*" + tick, "g"), " ")
    .replace(/(不要|别|无需|不需要|不能|不允许|do not|don't|without)\\s*[^，。,.；;\\n]*/gi, " ")
    .replace(/\\b(?:npm|pnpm|yarn|git)\\s+[^\\u3002\\uff0c,;；\\n]*/gi, " ")
    .replace(/\\b(?:document|documents|skill|readme|package\\.json|tsconfig)\\b/gi, " ")
    .replace(/[^\\S\\r\\n]+/g, " ")
    .trim();
  if (!clean) return "";
  const patterns = [
    /只\\s*(?:修改|改|做|保留)\\s*([^，。,.；;\\n]+?)(?=，|。|,|；|;|\\n|$)/i,
    /(?:做|开发|实现|搭建|新增|创建)\\s*(?:一个|这个|这种|一款)?\\s*([^，。,.；;\\n]+?)(?=，|。|,|；|;|\\n|$)/i,
    /把\\s*([^，。,.；;\\n]+?)\\s*(?:改成|做成|调整成|重构为)\\s*([^，。,.；;\\n]+)/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(clean);
    const candidate = cleanupTaskCandidate(match ? [match[1], match[2]].filter(Boolean).join("") : "");
    if (candidate) return candidate;
  }
  return cleanupTaskCandidate(clean.split(/[，。,.；;\\n]/)[0] || "");
}

function cleanupTaskCandidate(value) {
  return String(value || "")
    .replace(/^(?:一个|这个|这种|本次|这次|当前|我的|我这个)\\s*/i, "")
    .replace(/^(?:content|AI|Codex)\\s*$/i, "")
    .replace(/^(?:针对|进行|完成|处理)\\s*/i, "")
    .replace(/\\s*(?:进行整改|整改|优化|修复|改造|补齐|调整|重排|重构)\\s*$/i, "")
    .replace(/\\b(?:document|documents|skill|readme|npm|git)\\b/gi, "")
    .replace(/\\s+/g, " ")
    .replace(/[：:，。,.；;\\s]+$/g, "")
    .trim()
    .slice(0, 80);
}

function summarizeOutput(output) {
  if (typeof output !== "string" || !output.trim()) return "";
  return output.replace(secretPattern, "$1[redacted]").replace(/\\s+/g, " ").trim().slice(0, 180);
}

function normalizeHookName(value) {
  return ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"].includes(value) ? value : "Unknown";
}

function isEditToolName(toolName) {
  const normalized = String(toolName || "").toLowerCase();
  return normalized === "apply_patch" ||
    normalized.endsWith(".apply_patch") ||
    normalized === "edit" ||
    normalized.endsWith(".edit") ||
    normalized === "write" ||
    normalized.endsWith(".write");
}

function normalize(payload) {
  const hookEventName = normalizeHookName(firstString(payload, ["hookEventName", "hook_event_name", "event", "eventName"]));
  const toolInput = asRecord(payload.toolInput || payload.tool_input || payload.input);
  const prompt = firstString(payload, ["prompt", "userPrompt", "user_prompt"]);
  const command = firstString(payload, ["command", "cmd"]) || firstString(toolInput, ["command", "cmd"]);
  const commandSummary = sanitizeCommandSummary(command);
  const toolName = firstString(payload, ["toolName", "tool_name", "tool"]) || firstString(asRecord(payload.tool), ["name"]);
  const exitCode = firstNumber(payload, ["exitCode", "exit_code", "status"]);
  const success = typeof payload.success === "boolean" ? payload.success : typeof exitCode === "number" ? exitCode === 0 : undefined;
  const isEditIntent = isEditToolName(toolName);
  const isBuildCommand = /(^| )(npm|pnpm|yarn) (run )?build|tsc/.test(commandSummary);
  const isTestCommand = /(^| )(npm|pnpm|yarn) test|vitest|jest/.test(commandSummary);
  const isGitCommand = commandSummary.startsWith("git ");
  const event = {
    eventId: firstString(payload, ["eventId", "event_id"]) || "codex_event_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10),
    timestamp: firstString(payload, ["timestamp", "time"]) || new Date().toISOString(),
    hookEventName,
    sessionId: firstString(payload, ["sessionId", "session_id"]),
    cwd: firstString(payload, ["cwd", "workingDirectory", "working_directory"]),
    model: firstString(payload, ["model"]),
    permissionMode: firstString(payload, ["permissionMode", "permission_mode"]),
    source: firstString(payload, ["source"]) || "codex-hook",
    toolName,
    commandSummary,
    toolUseId: firstString(payload, ["toolUseId", "tool_use_id", "toolCallId"]),
    turnId: firstString(payload, ["turnId", "turn_id"]),
    isEditIntent,
    isBuildCommand,
    isTestCommand,
    isGitCommand,
    isBuildSuccess: Boolean(isBuildCommand && success),
    isTestSuccess: Boolean(isTestCommand && success),
    isGitSuccess: Boolean(isGitCommand && success),
    hasAssistantMessage: typeof payload.hasAssistantMessage === "boolean" ? payload.hasAssistantMessage : Boolean(firstString(payload, ["lastAssistantMessage", "last_assistant_message"])),
    stopHookActive: hookEventName === "Stop",
    transcriptPathExists: Boolean(firstString(payload, ["transcriptPath", "transcript_path"]))
  };
  if (prompt) {
    const promptSummary = summarizeTaskTheme(prompt);
    event.promptLength = prompt.length;
    if (promptSummary) event.promptSummary = promptSummary;
    event.promptClaritySignals = {
      hasOnlyModify: /只\\s*修改|只改|only/i.test(prompt),
      hasDoNot: /不要|不能|不允许|do not|don't/i.test(prompt),
      hasPreserve: /保留|保持|preserve|keep/i.test(prompt),
      hasAcceptance: /验收|通过|完成后|acceptance|verify/i.test(prompt),
      hasBuild: /build|构建/i.test(prompt),
      hasTest: /test|测试/i.test(prompt)
    };
    event.hasScopeWords = Boolean(event.promptClaritySignals.hasOnlyModify || event.promptClaritySignals.hasPreserve);
    event.hasAcceptanceCriteria = Boolean(event.promptClaritySignals.hasAcceptance || event.promptClaritySignals.hasBuild || event.promptClaritySignals.hasTest);
  }
  if (typeof exitCode === "number") event.exitCode = exitCode;
  if (typeof success === "boolean") event.success = success;
  const outputSummary = summarizeOutput(firstString(payload, ["output", "stdout", "stderr", "result", "error"]));
  if (outputSummary) event.outputSummary = outputSummary;
  return event;
}

let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  try {
    const payload = stdin.trim() ? JSON.parse(stdin) : {};
    const event = normalize(payload);
    fs.mkdirSync(path.dirname(EVENT_LOG_PATH), { recursive: true });
    fs.appendFileSync(EVENT_LOG_PATH, JSON.stringify(event) + "\\n", "utf8");
  } catch {
    process.exitCode = 0;
  }
});
`;
}

function summarizeOutput(output: string): string {
  if (!output.trim()) return "";
  return output.replace(secretPattern, "$1[redacted]").replace(/\s+/g, " ").trim().slice(0, 180);
}

function normalizeHookName(value: string): CodexHookEventName {
  const allowed = new Set(["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]);
  return allowed.has(value) ? (value as CodexHookEventName) : "Unknown";
}

function isEditToolName(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return (
    normalized === "apply_patch" ||
    normalized.endsWith(".apply_patch") ||
    normalized === "edit" ||
    normalized.endsWith(".edit") ||
    normalized === "write" ||
    normalized.endsWith(".write")
  );
}

function firstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
