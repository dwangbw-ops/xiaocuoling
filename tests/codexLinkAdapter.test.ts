import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeCodexCapabilities,
  convertHookEventsToEvidence,
  extractCodexConfigSignals,
  normalizeCodexHookPayload,
  sanitizeCommandSummary,
} from "../src/main/adapters/codexLinkAdapter";
import { installCodexHooks } from "../src/main/adapters/codexHooksInstaller";
import { appendCodexHookEvent, readCodexHookEvents } from "../src/main/adapters/codexEventStore";

describe("Codex hook event privacy", () => {
  it("redacts secrets and stores only command summaries", () => {
    expect(
      sanitizeCommandSummary(
        "OPENAI_API_KEY=sk-secret npm run build -- --token abc123 && echo done",
      ),
    ).toBe("npm run build");
    expect(sanitizeCommandSummary("deploy --token abc123 --password hunter2")).not.toContain(
      "abc123",
    );
    expect(sanitizeCommandSummary("deploy --token abc123 --password hunter2")).not.toContain(
      "hunter2",
    );
  });

  it("normalizes UserPromptSubmit without storing prompt text", () => {
    const event = normalizeCodexHookPayload({
      hook_event_name: "UserPromptSubmit",
      session_id: "s1",
      cwd: "/repo",
      prompt: "只修改首页，完成后 npm run build 通过，不要重构。",
    });

    expect(event.hookEventName).toBe("UserPromptSubmit");
    expect(event.sessionId).toBe("s1");
    expect(event.promptLength).toBeGreaterThan(0);
    expect(event.hasScopeWords).toBe(true);
    expect(event.hasAcceptanceCriteria).toBe(true);
    expect(event.promptSummary).toBe("首页");
    expect(JSON.stringify(event)).not.toContain("只修改首页");
  });
});

describe("Codex hook event store and installer", () => {
  it("appends JSONL events and reads them back", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-events-"));
    try {
      const logPath = path.join(dir, "codex_hook_events.jsonl");
      const event = normalizeCodexHookPayload({
        hookEventName: "SessionStart",
        sessionId: "s1",
        cwd: "/repo",
        model: "gpt-5",
      });

      await appendCodexHookEvent(logPath, event);

      expect(await readCodexHookEvents(logPath)).toHaveLength(1);
      expect(readFileSync(logPath, "utf8")).toContain("SessionStart");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("installs a repo-local xiaocuoling hook script", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-hooks-"));
    try {
      const result = await installCodexHooks({
        projectPath: dir,
        eventLogPath: path.join(dir, "codex_hook_events.jsonl"),
      });

      expect(result.installed).toBe(true);
      expect(result.hookPath.endsWith(".codex/hooks/xiaocuoling-capture.js")).toBe(true);
      expect(readFileSync(result.hookPath, "utf8")).toContain("codex_hook_events.jsonl");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("generated hook script writes only sanitized metadata to JSONL", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-hook-run-"));
    try {
      const logPath = path.join(dir, "codex_hook_events.jsonl");
      const result = await installCodexHooks({
        projectPath: dir,
        eventLogPath: logPath,
      });

      execFileSync(process.execPath, [result.hookPath], {
        input: JSON.stringify({
          hookEventName: "UserPromptSubmit",
          sessionId: "s1",
          cwd: dir,
          prompt: "做一个 content 离谱 MVP 雷达，针对功能整改，不要保存这段完整 prompt。",
        }),
      });
      execFileSync(process.execPath, [result.hookPath], {
        input: JSON.stringify({
          hookEventName: "PostToolUse",
          toolName: "Bash",
          command: "deploy --token abc123",
          exitCode: 0,
        }),
      });

      const content = readFileSync(logPath, "utf8");
      expect(content).toContain("UserPromptSubmit");
      expect(content).toContain("content 离谱 MVP 雷达");
      expect(content).not.toContain("不要保存这段完整 prompt");
      expect(content).not.toContain("abc123");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Codex event evidence", () => {
  it("converts hook events into session evidence without granting growth directly", () => {
    const evidence = convertHookEventsToEvidence([
      normalizeCodexHookPayload({ hookEventName: "SessionStart", sessionId: "s1", cwd: "/repo" }),
      normalizeCodexHookPayload({
        hookEventName: "PostToolUse",
        sessionId: "s1",
        toolName: "Bash",
        command: "npm run build",
        exitCode: 0,
      }),
      normalizeCodexHookPayload({ hookEventName: "Stop", sessionId: "s1" }),
    ]);

    expect(evidence.sessionStarted).toBe(true);
    expect(evidence.successfulCommands).toBe(1);
    expect(evidence.buildSuccess).toBe(true);
    expect(evidence.hadFileEditTool).toBe(false);
    expect(evidence.shouldIncreasePurificationDirectly).toBe(false);
  });

  it("recognizes edit tools and git/test evidence from hooks", () => {
    const evidence = convertHookEventsToEvidence([
      normalizeCodexHookPayload({
        hookEventName: "PreToolUse",
        toolName: "apply_patch",
        sessionId: "s1",
      }),
      normalizeCodexHookPayload({
        hookEventName: "PostToolUse",
        toolName: "Bash",
        command: "npm test",
        exitCode: 0,
      }),
      normalizeCodexHookPayload({
        hookEventName: "PostToolUse",
        toolName: "Bash",
        command: "git commit -m safe",
        exitCode: 0,
      }),
    ]);

    expect(evidence.hadFileEditTool).toBe(true);
    expect(evidence.testSuccess).toBe(true);
    expect(evidence.gitCommandSeen).toBe(true);
    expect(evidence.shouldIncreasePurificationDirectly).toBe(false);
  });
});

describe("Codex capability analysis", () => {
  it("extracts public config structure without leaking secret values", () => {
    const signals = extractCodexConfigSignals(`
model = "gpt-5"
approval_policy = "never"
sandbox_mode = "danger-full-access"
api_key = "sk-should-not-leak"

[mcp_servers.github]
command = "github-mcp"
[mcp_servers.vercel]
command = "vercel-mcp"
`);

    expect(signals.hasModel).toBe(true);
    expect(signals.hasApprovalPolicy).toBe(true);
    expect(signals.hasSandboxMode).toBe(true);
    expect(signals.mcpServerNames).toEqual(["github", "vercel"]);
    expect(JSON.stringify(signals)).not.toContain("sk-should-not-leak");
  });

  it("analyzes local Codex capability inventory from metadata only", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-codex-home-"));
    const projectDir = mkdtempSync(path.join(tmpdir(), "xiaocuoling-project-"));
    try {
      mkdirSync(path.join(dir, "skills", "frontend"), { recursive: true });
      writeFileSync(
        path.join(dir, "skills", "frontend", "SKILL.md"),
        "---\nname: frontend\n---\nsecret body should not be copied\n",
      );
      mkdirSync(path.join(dir, "skills", ".system", "imagegen"), { recursive: true });
      writeFileSync(path.join(dir, "skills", ".system", "imagegen", "SKILL.md"), "name: imagegen");
      mkdirSync(path.join(dir, "plugins", "cache", "github", "skills", "github"), {
        recursive: true,
      });
      writeFileSync(
        path.join(dir, "plugins", "cache", "github", "skills", "github", "SKILL.md"),
        "name: github",
      );
      writeFileSync(
        path.join(dir, "config.toml"),
        'model = "gpt-5"\napi_key = "sk-hidden"\n[mcp_servers.github]\ncommand = "x"\n',
      );
      writeFileSync(path.join(dir, "AGENTS.md"), "project rules");
      const eventLogPath = path.join(dir, "codex_hook_events.jsonl");
      await appendCodexHookEvent(
        eventLogPath,
        normalizeCodexHookPayload({
          hookEventName: "SessionStart",
          sessionId: "s1",
          cwd: projectDir,
          model: "gpt-5",
        }),
      );

      const analysis = await analyzeCodexCapabilities({
        codexHome: dir,
        eventLogPath,
        projectPath: projectDir,
        codexVersion: "codex test",
      });

      expect(analysis.codexCliDetected).toBe(true);
      expect(analysis.inventory.totalSkills).toBe(3);
      expect(analysis.inventory.customSkillNames).toContain("frontend");
      expect(analysis.inventory.pluginSkillNames).toContain("github");
      expect(analysis.config.mcpServerNames).toEqual(["github"]);
      expect(analysis.recentHooks.sessionStarts).toBe(1);
      expect(analysis.privacy.promptContentStored).toBe(false);
      expect(analysis.privacy.codeContentStored).toBe(false);
      expect(analysis.privacy.uploadsData).toBe(false);
      expect(JSON.stringify(analysis)).not.toContain("sk-hidden");
      expect(JSON.stringify(analysis)).not.toContain("secret body");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
