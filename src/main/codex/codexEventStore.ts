import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import type { CodexHookEvent } from "../../shared/types";

export async function appendCodexHookEvent(
  logPath: string,
  event: CodexHookEvent,
): Promise<void> {
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export async function readCodexHookEvents(
  logPath: string,
  limit = 100,
): Promise<CodexHookEvent[]> {
  if (!existsSync(logPath)) return [];
  const safeLimit = Math.max(1, limit);
  const recentLines: string[] = [];
  let totalLines = 0;
  const stream = createReadStream(logPath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      if (recentLines.length < safeLimit) {
        recentLines.push(line);
      } else {
        recentLines[totalLines % safeLimit] = line;
      }
      totalLines += 1;
    }
  } catch {
    stream.destroy();
  }

  const orderedLines =
    recentLines.length < safeLimit
      ? recentLines
      : [
          ...recentLines.slice(totalLines % safeLimit),
          ...recentLines.slice(0, totalLines % safeLimit),
        ];

  return orderedLines
    .map((line) => {
      try {
        return JSON.parse(line) as CodexHookEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is CodexHookEvent => Boolean(event))
    .reverse();
}
