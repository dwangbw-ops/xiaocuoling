import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { normalizeHookPayload } from "./codexHooksManager";
import type { CodexHookEvent } from "../../shared/types";

export interface ImportCodexHistoryResult {
  importedEvents: number;
  scannedSessions: number;
  latestSessionAt: string | null;
}

interface SessionFile {
  filePath: string;
  mtimeMs: number;
}

export async function importCodexSessionHistory(input: {
  codexHome: string;
  eventLogPath: string;
  limitFiles?: number;
}): Promise<ImportCodexHistoryResult> {
  const sessionsRoot = path.join(input.codexHome, "sessions");
  if (!existsSync(sessionsRoot)) {
    return { importedEvents: 0, scannedSessions: 0, latestSessionAt: null };
  }

  const files = (await listSessionFiles(sessionsRoot))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, input.limitFiles ?? 500);
  const existingIds = await readExistingEventIds(input.eventLogPath);
  const imported: CodexHookEvent[] = [];

  for (const file of files) {
    const events = await sessionFileToEvents(file.filePath);
    for (const event of events) {
      if (existingIds.has(event.eventId)) continue;
      existingIds.add(event.eventId);
      imported.push(event);
    }
  }

  if (imported.length) {
    await mkdir(path.dirname(input.eventLogPath), { recursive: true });
    await writeFile(
      input.eventLogPath,
      imported.map((event) => JSON.stringify(event)).join("\n") + "\n",
      { encoding: "utf8", flag: "a" },
    );
  }

  return {
    importedEvents: imported.length,
    scannedSessions: files.length,
    latestSessionAt: files[0] ? new Date(files[0].mtimeMs).toISOString() : null,
  };
}

async function sessionFileToEvents(filePath: string): Promise<CodexHookEvent[]> {
  const events: CodexHookEvent[] = [];
  const pendingTools = new Map<string, { toolName: string; command: string; timestamp: string }>();
  let sessionId = stableId(filePath);
  let cwd = "";
  let model = "";
  let permissionMode = "";
  let latestTimestamp = "";

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let index = 0;

  try {
    for await (const line of lines) {
      processSessionLine(line, index);
      index += 1;
    }
  } catch {
    stream.destroy();
  }

  function processSessionLine(line: string, index: number) {
    if (!line.trim()) return;
    if (line.length > 1_000_000) {
      const event = eventFromOversizedLine(filePath, line, index, sessionId, cwd, model, permissionMode);
      if (event) events.push(event);
      return;
    }
    const item = safeJson(line);
    if (!item) return;
    const timestamp = firstString(item, ["timestamp"]) || new Date().toISOString();
    latestTimestamp = timestamp;
    const payload = asRecord(item.payload);
    const type = firstString(item, ["type"]);

    if (type === "session_meta") {
      sessionId = firstString(payload, ["id"]) || sessionId;
      cwd = firstString(payload, ["cwd"]) || cwd;
      model = firstString(payload, ["model"]) || model;
      events.push(
        normalizeHookPayload({
          eventId: eventId(filePath, index, "SessionStart"),
          timestamp,
          hookEventName: "SessionStart",
          sessionId,
          cwd,
          model,
          source: "codex-history",
        }),
      );
      return;
    }

    if (type === "turn_context") {
      cwd = firstString(payload, ["cwd"]) || cwd;
      model = firstString(payload, ["model"]) || model;
      permissionMode =
        firstString(payload, ["approval_policy"]) ||
        firstString(payload, ["permission_profile"]) ||
        permissionMode;
      return;
    }

    if (type !== "response_item") return;

    const role = firstString(payload, ["role"]);
    if (role === "user") {
      const prompt = extractText(payload.content);
      events.push(
        normalizeHookPayload({
          eventId: eventId(filePath, index, "UserPromptSubmit"),
          timestamp,
          hookEventName: "UserPromptSubmit",
          sessionId,
          turnId: currentTurnId(sessionId, timestamp),
          cwd,
          model,
          permissionMode,
          prompt,
          source: "codex-history",
        }),
      );
      return;
    }

    const responseType = firstString(payload, ["type"]);
    if (responseType === "function_call") {
      const callId = firstString(payload, ["call_id"]) || eventId(filePath, index, "tool");
      const toolName = firstString(payload, ["name"]);
      const command = extractCommand(payload.arguments);
      pendingTools.set(callId, { toolName, command, timestamp });
      events.push(
        normalizeHookPayload({
          eventId: eventId(filePath, index, "PreToolUse"),
          timestamp,
          hookEventName: "PreToolUse",
          sessionId,
          turnId: currentTurnId(sessionId, timestamp),
          cwd,
          model,
          permissionMode,
          toolName,
          toolUseId: callId,
          command,
          source: "codex-history",
        }),
      );
      return;
    }

    if (responseType === "function_call_output") {
      const callId = firstString(payload, ["call_id"]);
      const pending = pendingTools.get(callId) ?? { toolName: "", command: "", timestamp };
      const output = extractText(payload.output);
      events.push(
        normalizeHookPayload({
          eventId: eventId(filePath, index, "PostToolUse"),
          timestamp,
          hookEventName: "PostToolUse",
          sessionId,
          turnId: currentTurnId(sessionId, timestamp),
          cwd,
          model,
          permissionMode,
          toolName: pending.toolName,
          toolUseId: callId,
          command: pending.command,
          output,
          success: !/exit code\s*[1-9]|error|failed/i.test(output),
          source: "codex-history",
        }),
      );
    }
  }

  if (events.length) {
    events.push(
      normalizeHookPayload({
        eventId: eventId(filePath, events.length + 1, "Stop"),
        timestamp: latestTimestamp || new Date().toISOString(),
        hookEventName: "Stop",
        sessionId,
        cwd,
        model,
        permissionMode,
        stopHookActive: false,
        source: "codex-history",
      }),
    );
  }

  return events;
}

async function readExistingEventIds(logPath: string): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!existsSync(logPath)) return ids;
  const stream = createReadStream(logPath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const id = regexFirst(line, /"eventId"\s*:\s*"([^"]+)"/);
      if (id) ids.add(id);
    }
  } catch {
    stream.destroy();
  }
  return ids;
}

async function listSessionFiles(root: string): Promise<SessionFile[]> {
  const files: SessionFile[] = [];
  await walk(root, files, 0);
  return files;
}

async function walk(current: string, files: SessionFile[], depth: number): Promise<void> {
  if (depth > 6) return;
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files, depth + 1);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    try {
      const info = await stat(fullPath);
      files.push({ filePath: fullPath, mtimeMs: info.mtimeMs });
    } catch {
      continue;
    }
  }
}

function extractCommand(value: unknown): string {
  const record = typeof value === "string" ? safeJson(value) : asRecord(value);
  return firstString(record, ["cmd", "command"]) || "";
}

function eventFromOversizedLine(
  filePath: string,
  line: string,
  index: number,
  sessionId: string,
  cwd: string,
  model: string,
  permissionMode: string,
): CodexHookEvent | null {
  if (!line.includes("function_call_output")) return null;
  const timestamp = regexFirst(line, /"timestamp"\s*:\s*"([^"]+)"/) || new Date().toISOString();
  const callId = regexFirst(line, /"call_id"\s*:\s*"([^"]+)"/);
  return normalizeHookPayload({
    eventId: eventId(filePath, index, "PostToolUseLarge"),
    timestamp,
    hookEventName: "PostToolUse",
    sessionId,
    cwd,
    model,
    permissionMode,
    toolUseId: callId,
    output: "Codex history output was too large; full output not stored.",
    source: "codex-history",
  });
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        const record = asRecord(item);
        return firstString(record, ["text", "content"]);
      })
      .filter(Boolean)
      .join("\n");
  }
  const record = asRecord(value);
  return firstString(record, ["text", "content", "output"]);
}

function regexFirst(value: string, pattern: RegExp): string {
  return pattern.exec(value)?.[1] ?? "";
}

function currentTurnId(sessionId: string, timestamp: string): string {
  return stableId(`${sessionId}:${timestamp}`).slice(0, 16);
}

function eventId(filePath: string, line: number, eventName: string): string {
  return `codex_history_${stableId(`${filePath}:${line}:${eventName}`)}`;
}

function stableId(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function safeJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return asRecord(value);
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (typeof source[key] === "string") return source[key] as string;
  }
  return "";
}
