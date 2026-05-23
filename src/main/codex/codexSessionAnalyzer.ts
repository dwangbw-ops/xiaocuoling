import type { CodexEventEvidence, CodexHookEvent } from "../../shared/types";

export function analyzeCodexHookSession(events: CodexHookEvent[]): CodexEventEvidence {
  const commandEvents = events.filter((event) => event.commandSummary);
  return {
    sessionStarted: events.some((event) => event.hookEventName === "SessionStart"),
    userPromptSubmitted: events.some((event) => event.hookEventName === "UserPromptSubmit"),
    hadFileEditTool: events.some((event) => Boolean(event.isEditIntent)),
    successfulCommands: commandEvents.filter((event) => event.success).length,
    failedCommands: commandEvents.filter((event) => event.success === false).length,
    buildSuccess: commandEvents.some((event) => event.isBuildSuccess),
    testSuccess: commandEvents.some((event) => event.isTestSuccess),
    gitCommandSeen: commandEvents.some((event) => event.isGitCommand),
    stopSeen: events.some((event) => event.hookEventName === "Stop"),
    shouldIncreasePurificationDirectly: false,
  };
}
