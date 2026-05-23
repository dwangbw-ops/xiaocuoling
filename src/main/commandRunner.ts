import { spawn } from "node:child_process";
import type { CommandRecord } from "../shared/types";

const allowedCommands = new Set([
  "npm run dev",
  "npm run build",
  "npm test",
  "git status",
  "git diff --stat",
  "git log --oneline -5",
]);

const shellByCommand: Record<string, { command: string; args: string[]; timeout: number }> = {
  "npm run dev": { command: "npm", args: ["run", "dev"], timeout: 12_000 },
  "npm run build": { command: "npm", args: ["run", "build"], timeout: 120_000 },
  "npm test": { command: "npm", args: ["test"], timeout: 120_000 },
  "git status": { command: "git", args: ["status"], timeout: 20_000 },
  "git diff --stat": { command: "git", args: ["diff", "--stat"], timeout: 20_000 },
  "git log --oneline -5": {
    command: "git",
    args: ["log", "--oneline", "-5"],
    timeout: 20_000,
  },
};

export function getAllowedCommands(): string[] {
  return [...allowedCommands];
}

export function runAllowedCommand(
  projectPath: string,
  commandText: string,
): Promise<CommandRecord> {
  if (!allowedCommands.has(commandText)) {
    return Promise.resolve({
      command: commandText,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      exitCode: 1,
      success: false,
      outputSummary: "命令不在 MVP 白名单内，未执行。",
    });
  }

  const spec = shellByCommand[commandText];
  const startTime = new Date().toISOString();

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, {
      cwd: projectPath,
      shell: false,
      env: process.env,
    });
    let output = "";
    let settled = false;

    const append = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > 120_000) {
        output = output.slice(-120_000);
      }
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      const isLongRunningDev = commandText === "npm run dev";
      resolve({
        command: commandText,
        startTime,
        endTime: new Date().toISOString(),
        exitCode: null,
        success: isLongRunningDev,
        outputSummary: summarizeOutput(
          output,
          isLongRunningDev
            ? "npm run dev 持续运行，已停止记录；它只算成功命令迹象，不算 build/test 交付。"
            : "命令超时，已停止记录。",
        ),
      });
    }, spec.timeout);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command: commandText,
        startTime,
        endTime: new Date().toISOString(),
        exitCode: 1,
        success: false,
        outputSummary: summarizeOutput(error.message),
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command: commandText,
        startTime,
        endTime: new Date().toISOString(),
        exitCode: code,
        success: code === 0,
        outputSummary: summarizeOutput(output),
      });
    });
  });
}

function summarizeOutput(output: string, prefix = ""): string {
  const sanitized = output
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[\w.-]+/gi, "$1=[redacted]")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-18)
    .join("\n");

  const summary = [prefix, sanitized].filter(Boolean).join("\n");
  return summary.slice(0, 4000) || "命令没有输出。";
}
