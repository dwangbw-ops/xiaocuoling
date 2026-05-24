import type { CodexSessionRecord } from "./types";
import { isMetadataOnlyGoal, summarizeTaskTheme } from "./taskSummary";

export interface SessionNarrative {
  projectName: string;
  projectPath: string;
  goal: string;
  items: string[];
}

export function buildSessionNarrative(session: CodexSessionRecord): SessionNarrative {
  const projectPath = session.projectPath.trim();
  const projectName = projectPath
    ? projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? projectPath
    : "未记录项目";
  const items = buildWorkItems(session);
  const hasRealGoal = Boolean(session.taskGoal.trim()) && !isMetadataOnlyGoal(session.taskGoal);
  const goal = hasRealGoal ? summarizeTaskTheme(session.taskGoal, projectName) : "";

  return {
    projectName,
    projectPath: projectPath || "未记录路径",
    goal: goal && !isMetadataOnlyGoal(goal) ? goal : "未记录任务主题",
    items: items.length ? items : ["未记录有效整改方向"],
  };
}

function buildWorkItems(session: CodexSessionRecord): string[] {
  const items: string[] = [];
  const goal = isMetadataOnlyGoal(session.taskGoal) ? "" : session.taskGoal;

  if (/UI|界面|视觉|样式|布局|面板|卡片|按钮|文案|精简|高级|好看|桌面|浮窗/i.test(goal)) {
    pushUnique(items, "UI 整改：调整界面、层级或展示方式");
  }
  if (/功能|逻辑|按钮|读取|连接|生成|推荐|分析|抓取|报告|记录|时间线|API|hooks?/i.test(goal)) {
    pushUnique(items, "功能整改：补齐读取、分析或推荐逻辑");
  }
  if (/真实|假|兜底|记录|数据|GitHub|API|不要作假|隐私|无意义|细节|document|技术细节/i.test(goal)) {
    pushUnique(items, "数据整改：保留真实记录，过滤无意义细节");
  }
  if (/日报|周报|报告|能力|习惯|方向|建议|总结|复盘/i.test(goal)) {
    pushUnique(items, "能力报告：聚合使用习惯和优化方向");
  }

  const hasVerification = session.buildSuccess || session.testSuccess || session.gitCommitCreated;
  if (hasVerification) {
    pushUnique(items, "结果：已留下可验证结果");
  } else if (session.status === "working") {
    pushUnique(items, "进展：有项目修改和运行迹象，尚未形成交付");
  } else if (session.status === "unverified") {
    pushUnique(items, "进展：有项目修改，尚未完成验证");
  }

  return items;
}

function pushUnique(items: string[], value: string): void {
  if (!items.includes(value)) items.push(value);
}
