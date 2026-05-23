import { describe, expect, it } from "vitest";
import { normalizeObserverSummary } from "../src/main/codex/observerSummary";

describe("xiaocuoling observer summary", () => {
  it("keeps session-summary as delivery evidence without storing private logs", () => {
    const evidence = normalizeObserverSummary(
      {
        commandsRun: [
          {
            command: "OPENAI_API_KEY=sk-secret npm run build -- --token abc",
            exitCode: 0,
            outputSummary: "token abc full private output ".repeat(30),
          },
        ],
        buildSuccess: true,
        detectedSkills: ["Electron 桌面端", "Electron 桌面端", "本地存储"],
        deliveryStatus: "breakthrough",
        summary: "完成交付 password hunter2",
      },
      "2026-05-23T10:00:00.000Z",
    );

    expect(evidence.buildSuccess).toBe(true);
    expect(evidence.deliveryStatus).toBe("breakthrough");
    expect(evidence.commandsRun[0].command).toBe("npm run build");
    expect(evidence.detectedSkills).toHaveLength(2);
    expect(JSON.stringify(evidence)).not.toContain("sk-secret");
    expect(JSON.stringify(evidence)).not.toContain("hunter2");
    expect(JSON.stringify(evidence)).not.toContain("abc full private output");
  });
});
