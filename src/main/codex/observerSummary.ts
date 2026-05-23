import type { CommandRecord, SessionStatus, SkillDetection } from "../../shared/types";
import { sanitizeCommandSummary } from "./codexHooksManager";

export interface ObserverSummaryEvidence {
  commandsRun: CommandRecord[];
  buildSuccess: boolean;
  testSuccess: boolean;
  detectedSkills: SkillDetection[];
  deliveryStatus: SessionStatus | null;
  summary: string;
}

const allowedStatuses: SessionStatus[] = [
  "inactive",
  "unverified",
  "working",
  "delivered",
  "breakthrough",
];

export function normalizeObserverSummary(
  payload: unknown,
  timestamp = new Date().toISOString(),
): ObserverSummaryEvidence {
  const record = asRecord(payload);
  const commands = Array.isArray(record.commandsRun) ? record.commandsRun : [];
  const commandRecords = commands
    .map((item) => normalizeCommand(item, timestamp))
    .filter((item): item is CommandRecord => Boolean(item));
  const detectedSkills = normalizeDetectedSkills(record.detectedSkills);
  const deliveryStatus =
    typeof record.deliveryStatus === "string" &&
    allowedStatuses.includes(record.deliveryStatus as SessionStatus)
      ? (record.deliveryStatus as SessionStatus)
      : null;

  return {
    commandsRun: commandRecords,
    buildSuccess:
      record.buildSuccess === true ||
      commandRecords.some((command) => command.command.includes("build") && command.success),
    testSuccess:
      record.testSuccess === true ||
      commandRecords.some((command) => /test|vitest|jest/.test(command.command) && command.success),
    detectedSkills,
    deliveryStatus,
    summary: typeof record.summary === "string" ? sanitizeText(record.summary, 220) : "",
  };
}

function normalizeCommand(item: unknown, timestamp: string): CommandRecord | null {
  if (typeof item === "string") {
    const command = sanitizeCommandSummary(item);
    if (!command) return null;
    return {
      command,
      startTime: timestamp,
      endTime: timestamp,
      exitCode: null,
      success: false,
      outputSummary: "xiaocuoling observer summary: command name only.",
    };
  }

  const record = asRecord(item);
  const command = sanitizeCommandSummary(record.command);
  if (!command) return null;
  const exitCode = typeof record.exitCode === "number" ? record.exitCode : null;
  const success =
    typeof record.success === "boolean"
      ? record.success
      : exitCode !== null
        ? exitCode === 0
        : false;

  return {
    command,
    startTime:
      typeof record.startTime === "string" ? record.startTime : timestamp,
    endTime: typeof record.endTime === "string" ? record.endTime : timestamp,
    exitCode,
    success,
    outputSummary:
      typeof record.outputSummary === "string"
        ? sanitizeText(record.outputSummary, 160)
        : "xiaocuoling observer summary: full output not stored.",
  };
}

function normalizeDetectedSkills(value: unknown): SkillDetection[] {
  if (!Array.isArray(value)) return [];
  const detections: SkillDetection[] = [];

  for (const item of value) {
    const name =
      typeof item === "string"
        ? item
        : typeof asRecord(item).name === "string"
          ? (asRecord(item).name as string)
          : typeof asRecord(item).skillId === "string"
            ? (asRecord(item).skillId as string)
            : "";
    const cleanName = sanitizeText(name, 80);
    if (!cleanName) continue;
    const skillId = slugify(cleanName);
    if (detections.some((detection) => detection.skillId === skillId)) continue;
    detections.push({
      skillId,
      name: cleanName,
      evidence: ["xiaocuoling session-summary"],
    });
  }

  return detections;
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*(?:[=:]\s*|\s+))['"]?[^'"\s]+/gi,
      "$1[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "observer-skill";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
