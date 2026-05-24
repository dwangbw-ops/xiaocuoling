import type { WeeklyReport } from "./types";

export type AbilityReportPresentationState = "empty" | "missing-fields" | "ready";

export interface AbilityReportPresentation {
  state: AbilityReportPresentationState;
  rows: Array<{ label: string; text: string }>;
  note: string;
}

export function buildAbilityReportPresentation(
  label: string,
  report: WeeklyReport | null,
  empty: string,
): AbilityReportPresentation {
  if (!report) {
    return {
      state: "empty",
      rows: [
        { label: "当前状态", text: empty },
        {
          label: "需要什么",
          text: "需要真实 Codex session、任务主题、项目变化和交付证据，报告才会分析使用习惯。",
        },
      ],
      note: `${label}还没有可展示的真实报告。`,
    };
  }

  const missing = missingInsightFields(report);
  if (missing.length) {
    return {
      state: "missing-fields",
      rows: [
        { label: "缺少字段", text: missing.join("、") },
        {
          label: "原因",
          text: "这是一份旧版或不完整报告，本地 JSON 里没有可展示的习惯分析内容。",
        },
        {
          label: "处理方式",
          text: "重新读取 Codex 使用过程后，只会基于真实 session 重新生成报告。",
        },
      ],
      note: report.summary || `${label}存在，但缺少习惯分析字段。`,
    };
  }

  return {
    state: "ready",
    rows: [
      { label: "使用习惯", text: report.habitSummary },
      { label: "优化方向", text: report.optimizationAdvice },
      { label: "下一次练习", text: report.nextPractice },
    ],
    note: report.summary,
  };
}

function missingInsightFields(report: WeeklyReport): string[] {
  const fields: Array<[keyof WeeklyReport, string]> = [
    ["habitSummary", "使用习惯"],
    ["optimizationAdvice", "优化方向"],
    ["nextPractice", "下一次练习"],
  ];
  return fields
    .filter(([key]) => !String(report[key] ?? "").trim())
    .map(([, label]) => label);
}
