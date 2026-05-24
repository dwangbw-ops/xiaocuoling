import { describe, expect, it } from "vitest";
import { buildAbilityReportPresentation } from "../src/shared/abilityReportPresentation";
import type { WeeklyReport } from "../src/shared/types";

const completeReport: WeeklyReport = {
  reportId: "daily_2026-05-24_2026-05-24",
  period: "daily",
  startDate: "2026-05-24",
  endDate: "2026-05-24",
  aiCapabilityScore: 42,
  trend: "flat",
  effectiveSessions: 1,
  inactiveSessions: 1,
  deliveredSessions: 0,
  breakthroughSessions: 0,
  newSkills: 0,
  buildSuccessRate: 0,
  promptClarityAverage: 60,
  summary: "今日暂无明显变化。",
  habitSummary: "今天有使用 Codex，但还没有形成交付闭环。",
  optimizationAdvice: "结束前要确认结果能用。",
  nextPractice: "下一次先写清目标和验收标准。",
};

describe("ability report presentation", () => {
  it("explains exactly why a stored old report has no habit fields", () => {
    const reportWithoutInsights = {
      ...completeReport,
      habitSummary: "",
      optimizationAdvice: "",
      nextPractice: "",
    };

    const presentation = buildAbilityReportPresentation(
      "今晚日报",
      reportWithoutInsights,
      "今晚还没有生成日报。",
    );

    expect(presentation.state).toBe("missing-fields");
    expect(presentation.rows).toEqual([
      {
        label: "缺少字段",
        text: "使用习惯、优化方向、下一次练习",
      },
      {
        label: "原因",
        text: "这是一份旧版或不完整报告，本地 JSON 里没有可展示的习惯分析内容。",
      },
      {
        label: "处理方式",
        text: "重新读取 Codex 使用过程后，只会基于真实 session 重新生成报告。",
      },
    ]);
  });

  it("shows clear empty-state requirements when no report exists", () => {
    const presentation = buildAbilityReportPresentation(
      "周末周报",
      null,
      "周日 21:00 后生成周报。",
    );

    expect(presentation.state).toBe("empty");
    expect(presentation.rows[0]).toEqual({
      label: "当前状态",
      text: "周日 21:00 后生成周报。",
    });
    expect(presentation.rows[1].text).toContain("真实 Codex session");
  });
});
