import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  installCodexHooks,
  installGlobalCodexHooks,
  normalizeHookPayload,
} from "../src/main/codex/codexHooksManager";
import { readCodexHookEvents } from "../src/main/codex/codexEventStore";
import { importCodexSessionHistory } from "../src/main/codex/codexHistoryImporter";
import { analyzeCodexHookSession } from "../src/main/codex/codexSessionAnalyzer";

describe("codex hooks manager", () => {
  it("installs the repo-local xiaocuoling capture hook", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-capture-"));
    try {
      const result = await installCodexHooks({
        projectPath: dir,
        eventLogPath: path.join(dir, "codex_hook_events.jsonl"),
      });

      expect(result.hookPath.endsWith(".codex/hooks/xiaocuoling-capture.js")).toBe(true);
      expect(readFileSync(result.hookPath, "utf8")).toContain("promptClaritySignals");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("installs a global capture hook without requiring a project folder", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-global-capture-"));
    try {
      const result = await installGlobalCodexHooks({
        codexHome: dir,
        eventLogPath: path.join(dir, "codex_hook_events.jsonl"),
      });

      expect(result.hookPath.endsWith("hooks/xiaocuoling-capture.js")).toBe(true);
      expect(readFileSync(result.hookPath, "utf8")).toContain("promptClaritySignals");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes hook payloads without saving prompt, patch, or full terminal output", () => {
    const promptEvent = normalizeHookPayload({
      hookEventName: "UserPromptSubmit",
      sessionId: "s1",
      turnId: "t1",
      cwd: "/repo",
      prompt: "只修改首页，不要重构，保留现有数据，验收时 npm run build 和 npm test 通过。",
    });
    const preTool = normalizeHookPayload({
      hookEventName: "PreToolUse",
      sessionId: "s1",
      toolName: "Bash",
      toolUseId: "u1",
      toolInput: { command: "OPENAI_API_KEY=sk-secret npm run build -- --token abc" },
    });
    const postTool = normalizeHookPayload({
      hookEventName: "PostToolUse",
      sessionId: "s1",
      toolName: "Bash",
      toolUseId: "u1",
      command: "npm run build",
      exitCode: 0,
      output: "line ".repeat(200),
    });

    expect(promptEvent.promptLength).toBeGreaterThan(0);
    expect(promptEvent.promptClaritySignals).toMatchObject({
      hasOnlyModify: true,
      hasDoNot: true,
      hasPreserve: true,
      hasAcceptance: true,
      hasBuild: true,
      hasTest: true,
    });
    expect(JSON.stringify(promptEvent)).not.toContain("只修改首页");
    expect(preTool.commandSummary).toBe("npm run build");
    expect(JSON.stringify(preTool)).not.toContain("sk-secret");
    expect(postTool.outputSummary?.length ?? 0).toBeLessThan(220);
    expect(postTool.isBuildSuccess).toBe(true);
    expect(
      normalizeHookPayload({
        hookEventName: "PreToolUse",
        toolName: "functions.apply_patch",
      }).isEditIntent,
    ).toBe(true);
  });

  it("generated hook writes sanitized JSONL metadata", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-capture-run-"));
    try {
      mkdirSync(path.join(dir, "repo"), { recursive: true });
      const logPath = path.join(dir, "codex_hook_events.jsonl");
      const result = await installCodexHooks({
        projectPath: path.join(dir, "repo"),
        eventLogPath: logPath,
      });

      execFileSync(process.execPath, [result.hookPath], {
        input: JSON.stringify({
          hookEventName: "UserPromptSubmit",
          sessionId: "s1",
          prompt: "不要保存完整 prompt",
        }),
      });
      execFileSync(process.execPath, [result.hookPath], {
        input: JSON.stringify({
          hookEventName: "PostToolUse",
          toolName: "Bash",
          command: "deploy --token abc123",
          exitCode: 0,
          output: "very long output ".repeat(80),
        }),
      });

      const content = readFileSync(logPath, "utf8");
      expect(content).toContain("UserPromptSubmit");
      expect(content).not.toContain("不要保存完整 prompt");
      expect(content).not.toContain("abc123");
      expect(await readCodexHookEvents(logPath)).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("codex history importer", () => {
  it("imports global Codex session metadata without saving prompt or full output", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-history-"));
    try {
      const sessionDir = path.join(dir, "sessions", "2026", "05", "23");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        path.join(sessionDir, "rollout-test.jsonl"),
        [
          {
            timestamp: "2026-05-23T10:00:00.000Z",
            type: "session_meta",
            payload: { id: "s1", cwd: "/repo", model: "gpt-5" },
          },
          {
            timestamp: "2026-05-23T10:01:00.000Z",
            type: "response_item",
            payload: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "不要保存完整 prompt，完成后 npm run build。" }],
            },
          },
          {
            timestamp: "2026-05-23T10:02:00.000Z",
            type: "response_item",
            payload: {
              type: "function_call",
              name: "functions.exec_command",
              call_id: "call1",
              arguments: JSON.stringify({ cmd: "OPENAI_API_KEY=sk-secret npm run build" }),
            },
          },
          {
            timestamp: "2026-05-23T10:03:00.000Z",
            type: "response_item",
            payload: {
              type: "function_call_output",
              call_id: "call1",
              output: "secret output ".repeat(50),
            },
          },
        ].map((item) => JSON.stringify(item)).join("\n"),
      );

      const logPath = path.join(dir, "codex_hook_events.jsonl");
      const result = await importCodexSessionHistory({
        codexHome: dir,
        eventLogPath: logPath,
      });
      const content = readFileSync(logPath, "utf8");

      expect(result.scannedSessions).toBe(1);
      expect(result.importedEvents).toBeGreaterThanOrEqual(4);
      expect(content).toContain("codex-history");
      expect(content).not.toContain("不要保存完整 prompt");
      expect(content).not.toContain("sk-secret");
      expect(content).not.toContain("secret output secret output secret output");
      expect(await readCodexHookEvents(logPath)).toHaveLength(result.importedEvents);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("codex session analyzer", () => {
  it("separates hooks behavior from delivery evidence", () => {
    const evidence = analyzeCodexHookSession([
      normalizeHookPayload({ hookEventName: "SessionStart", sessionId: "s1" }),
      normalizeHookPayload({
        hookEventName: "PreToolUse",
        sessionId: "s1",
        toolName: "apply_patch",
        toolUseId: "u1",
      }),
      normalizeHookPayload({
        hookEventName: "PostToolUse",
        sessionId: "s1",
        toolName: "Bash",
        toolUseId: "u2",
        command: "npm test",
        exitCode: 0,
      }),
      normalizeHookPayload({
        hookEventName: "Stop",
        sessionId: "s1",
        hasAssistantMessage: true,
        lastAssistantMessage: "private assistant text",
      }),
    ]);

    expect(evidence.sessionStarted).toBe(true);
    expect(evidence.hadFileEditTool).toBe(true);
    expect(evidence.testSuccess).toBe(true);
    expect(evidence.shouldIncreasePurificationDirectly).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain("private assistant text");
  });
});
