import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeCodexCapabilities } from "./adapters/codexLinkAdapter";
import { calculateCodexBaseline } from "../shared/rules";
import type { CodexBaseline } from "../shared/types";

export async function captureCodexBaseline(input?: {
  eventLogPath?: string;
  projectPath?: string | null;
}): Promise<CodexBaseline> {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const capabilityAnalysis = await analyzeCodexCapabilities({
    codexHome,
    eventLogPath: input?.eventLogPath ?? path.join(codexHome, "codex_hook_events.jsonl"),
    projectPath: input?.projectPath ?? null,
  });
  const codexHomePresent = existsSync(codexHome);
  const configPresent =
    existsSync(path.join(codexHome, "config.toml")) ||
    existsSync(path.join(codexHome, "AGENTS.md"));
  const customSkillNames = capabilityAnalysis.inventory.customSkillNames;
  const bundledSkillNames = capabilityAnalysis.inventory.bundledSkillNames;
  const pluginSkillNames = capabilityAnalysis.inventory.pluginSkillNames;
  const score = calculateCodexBaseline({
    codexHomePresent,
    configPresent,
    customSkillCount: customSkillNames.length,
    pluginSkillCount: pluginSkillNames.length,
    bundledSkillCount: bundledSkillNames.length,
  });

  return {
    capturedAt: new Date().toISOString(),
    codexHome,
    codexHomePresent,
    configPresent,
    capabilityAnalysis,
    customSkillCount: customSkillNames.length,
    pluginSkillCount: pluginSkillNames.length,
    bundledSkillCount: bundledSkillNames.length,
    sampledSkillNames: [...new Set([...customSkillNames, ...pluginSkillNames])]
      .sort()
      .slice(0, 18),
    ...score,
    summary: capabilityAnalysis.summary || score.summary,
  };
}
