import type {
  CommandRecord,
  GrowthArchetype,
  PetStage,
  SessionStatus,
  SkillQualityEvidence,
  SkillDetection,
  Trend,
  WeeklyReport,
} from "./types";

export interface ClassificationInput {
  changedFilesCount: number;
  successfulCommands: number;
  buildSuccess: boolean;
  testSuccess: boolean;
  gitCommitCreated: boolean;
  detectedSkills: string[];
  promptClarityScore?: number;
}

export interface RewardInput {
  status: SessionStatus;
  successfulCommands: number;
  buildSuccess: boolean;
  testSuccess: boolean;
  gitCommitCreated: boolean;
  newSkillCount: number;
}

export interface CapabilityInput {
  deliveryScore: number;
  verificationScore: number;
  promptClarityScore: number;
  repairScore: number;
  masteredToolScore: number;
}

export interface SkillEvidenceInput {
  dependencies: string[];
  filePaths: string[];
  contentSignals: string[];
}

export interface WeeklySessionInput {
  status: SessionStatus;
  buildSuccess: boolean;
  testSuccess: boolean;
  promptClarityScore: number;
  detectedSkills: string[];
}

export interface WeeklyReportInput {
  period?: "daily" | "weekly";
  startDate: string;
  endDate: string;
  currentSessions: WeeklySessionInput[];
  previousSessions: WeeklySessionInput[];
  aiCapabilityScore: number;
}

export interface CodexBaselineInput {
  codexHomePresent: boolean;
  configPresent: boolean;
  customSkillCount: number;
  pluginSkillCount: number;
  bundledSkillCount: number;
}

export interface CodexBaselineScore {
  aiCapabilityScore: number;
  purificationFloor: number;
  expFloor: number;
  summary: string;
}

export interface ArchetypeSessionInput {
  status: SessionStatus;
  buildSuccess: boolean;
  testSuccess: boolean;
  promptClarityScore: number;
  detectedSkills: string[];
  addedFilesCount: number;
  newDependencies: string[];
  gitCommitCreated: boolean;
  commandsRun: CommandRecord[];
}

const statusFeedback: Record<SessionStatus, string> = {
  inactive: "你打开了 Codex，但没有留下可验证的成果。",
  unverified: "Codex 改了东西，但你还没证明它能跑。",
  working: "有工作痕迹，但还不是交付。",
  delivered: "这次有交付证据，我只亮一点。",
  breakthrough: "这次不是工具堆砌，是你真的掌握了一个新动作。",
};

export function classifySession(input: ClassificationInput): SessionStatus {
  const hasProjectChange = input.changedFilesCount > 0 || input.gitCommitCreated;
  if (!hasProjectChange) return "inactive";

  const deliveryProofCount = [
    input.buildSuccess,
    input.testSuccess,
    input.gitCommitCreated,
    input.successfulCommands >= 2,
    input.changedFilesCount > 0,
  ].filter(Boolean).length;
  const delivered = deliveryProofCount >= 2;
  const hasVerification = input.buildSuccess || input.testSuccess;
  const promptIsClear = (input.promptClarityScore ?? 0) >= 70;

  if (
    delivered &&
    input.detectedSkills.length > 0 &&
    hasVerification &&
    promptIsClear
  ) {
    return "breakthrough";
  }

  if (delivered) {
    return "delivered";
  }

  if (input.changedFilesCount > 0 && input.successfulCommands > 0) {
    return "working";
  }

  if (input.changedFilesCount > 0) {
    return "unverified";
  }

  return "inactive";
}

export function feedbackForStatus(status: SessionStatus): string {
  return statusFeedback[status];
}

export function calculateSessionReward(input: RewardInput): {
  exp: number;
  purification: number;
} {
  const baseExp: Record<SessionStatus, number> = {
    inactive: 0,
    unverified: 1,
    working: 5,
    delivered: 15,
    breakthrough: 25,
  };

  const basePurification: Record<SessionStatus, number> = {
    inactive: 0,
    unverified: 0,
    working: 0,
    delivered: 1,
    breakthrough: 3,
  };

  return {
    exp: baseExp[input.status],
    purification: basePurification[input.status],
  };
}

export function capPurificationGain(input: {
  requested: number;
  dailyEarned: number;
  weeklyEarned: number;
  dailyLimit?: number;
  weeklyLimit?: number;
}): number {
  const dailyLimit = input.dailyLimit ?? 5;
  const weeklyLimit = input.weeklyLimit ?? 15;
  return clamp(
    Math.min(
      input.requested,
      Math.max(0, dailyLimit - input.dailyEarned),
      Math.max(0, weeklyLimit - input.weeklyEarned),
    ),
    0,
    input.requested,
  );
}

export function stageForPurification(score: number): PetStage {
  if (score <= 30) return "egg";
  if (score <= 100) return "chaos";
  if (score <= 220) return "apprentice";
  if (score <= 400) return "maker";
  if (score <= 700) return "mage";
  return "creator";
}

export function stageForCodexReadiness(readinessScore: number): PetStage {
  if (readinessScore <= 0) return "egg";
  if (readinessScore <= 35) return "chaos";
  if (readinessScore <= 70) return "apprentice";
  return "maker";
}

export function calculateSkillUsageImpact(status: SessionStatus): {
  exp: number;
  purification: number;
  usageScore: number;
} {
  if (status === "inactive" || status === "unverified" || status === "working") {
    return { exp: 0, purification: 0, usageScore: 1 };
  }
  if (status === "delivered") {
    return { exp: 3, purification: 0, usageScore: 5 };
  }
  return { exp: 5, purification: 1, usageScore: 10 };
}

export function calculateSkillQualityScore(evidence: SkillQualityEvidence): number {
  if (
    evidence.stars === 0 &&
    evidence.forks === 0 &&
    evidence.openIssues === 0 &&
    !evidence.lastPushedAt &&
    !evidence.hasReadme &&
    !evidence.hasExamples &&
    !evidence.hasLicense
  ) {
    return 0;
  }

  const starsScore =
    evidence.stars === 0
      ? 0
      : evidence.stars <= 50
        ? 10
        : evidence.stars <= 500
          ? 30
          : evidence.stars <= 3000
            ? 60
            : 100;
  const forksScore =
    evidence.forks === 0 ? 0 : evidence.forks <= 20 ? 30 : evidence.forks <= 100 ? 60 : 100;
  const pushedScore = scoreLastPushed(evidence.lastPushedAt);
  const issueScore = scoreIssueHealth(evidence.openIssues, evidence.stars, pushedScore);
  const docsScore =
    (evidence.hasReadme ? 45 : 0) +
    (evidence.hasExamples ? 35 : 0) +
    (evidence.repoAgeDays > 0 ? 20 : 0);
  const licenseScore = evidence.hasLicense ? 100 : 0;

  return clamp(
    Math.round(
      starsScore * 0.25 +
        pushedScore * 0.25 +
        forksScore * 0.1 +
        issueScore * 0.15 +
        Math.min(100, docsScore) * 0.15 +
        licenseScore * 0.1,
    ),
    0,
    100,
  );
}

export function scorePromptClarity(goal: string): number {
  const text = goal.trim().toLowerCase();
  if (!text) return 0;

  let score = Math.min(20, Math.floor(text.length / 6));
  const hasClearTarget = /(只|实现|修复|新增|修改|调整|页面|模块|组件|首页|面板|移动端|桌面端)/.test(text);
  const hasScope = /(范围|只改|只修改|保留|不重构|现有|兼容|文件|目录|数据结构)/.test(text);
  const hasAcceptance = /(验收|完成后|通过|运行|可用|清单|标准|成功|验证|build|test|npm run)/.test(text);
  const hasDoNot = /(不要|不做|禁止|别|无需|不需要|不能|do not|don't)/.test(text);
  const hasPreserve = /(保留|保持|不重构|现有|兼容|不破坏|preserve|keep)/.test(text);
  const hasTechOrPlatform = /(react|vite|electron|tailwind|typescript|node|json|api|git|npm|测试|构建|build|test|移动端|桌面端|mac|windows|浏览器|本地)/.test(text);

  if (hasClearTarget) score += 20;
  if (hasScope) score += 20;
  if (hasAcceptance) score += 25;
  if (hasDoNot) score += 10;
  if (hasPreserve) score += 10;
  if (hasTechOrPlatform) score += 10;

  const vague = [
    "优化一下",
    "做个 app",
    "做个app",
    "太丑了",
    "改一下",
    "重新做",
    "随便",
    "自由发挥",
  ];

  if (vague.some((phrase) => text.includes(phrase))) {
    score -= 25;
  }

  const constraintCount = [
    hasScope,
    hasAcceptance,
    hasDoNot,
    hasPreserve,
    hasTechOrPlatform,
  ].filter(Boolean).length;
  if (text.length < 20) score = Math.min(score, 40);
  if (constraintCount < 2) score = Math.min(score, 65);
  if (!(hasClearTarget && hasScope && hasAcceptance)) score = Math.min(score, 80);

  return clamp(Math.round(score), 0, 100);
}

export function calculateAiCapabilityScore(input: CapabilityInput): number {
  return clamp(
    Math.round(
      input.deliveryScore * 0.35 +
        input.verificationScore * 0.25 +
        input.promptClarityScore * 0.15 +
        input.repairScore * 0.15 +
        input.masteredToolScore * 0.1,
    ),
    0,
    100,
  );
}

export function calculateCodexBaseline(
  input: CodexBaselineInput,
): CodexBaselineScore {
  if (
    !input.codexHomePresent &&
    !input.configPresent &&
    input.customSkillCount === 0 &&
    input.pluginSkillCount === 0 &&
    input.bundledSkillCount === 0
  ) {
    return {
      aiCapabilityScore: 0,
      purificationFloor: 0,
      expFloor: 0,
      summary: "未发现本地 Codex 元数据，保持初始状态。",
    };
  }

  const skillSignal = Math.min(
    68,
    input.customSkillCount * 3 +
      input.pluginSkillCount * 0.7 +
      input.bundledSkillCount * 0.5,
  );
  const setupSignal =
    (input.codexHomePresent ? 8 : 0) + (input.configPresent ? 8 : 0);
  const aiCapabilityScore = clamp(Math.round(skillSignal + setupSignal), 15, 88);

  return {
    aiCapabilityScore,
    purificationFloor: 0,
    expFloor: 0,
    summary: `已根据本地 Codex 元数据校准：自定义技能 ${input.customSkillCount} 个，插件技能 ${input.pluginSkillCount} 个，基础技能 ${input.bundledSkillCount} 个。`,
  };
}

export function inferGrowthArchetype(
  sessions: ArchetypeSessionInput[],
): GrowthArchetype {
  if (!sessions.length) return "balanced";

  const builderScore =
    sessions.reduce((sum, session) => sum + session.addedFilesCount, 0) +
    sessions.filter((session) => session.buildSuccess).length * 2;
  const debuggerScore = sessions.reduce((sum, session) => {
    const failed = session.commandsRun.some((command) => !command.success);
    const recovered = failed && (session.buildSuccess || session.testSuccess);
    return sum + (recovered ? 5 : 0);
  }, 0);
  const promptScore =
    sessions.reduce((sum, session) => sum + session.promptClarityScore, 0) /
    sessions.length;
  const explorerScore =
    new Set(sessions.flatMap((session) => session.detectedSkills)).size * 4 +
    new Set(sessions.flatMap((session) => session.newDependencies)).size * 3;
  const shipperScore =
    sessions.filter((session) => session.gitCommitCreated).length * 4 +
    sessions.filter((session) => session.buildSuccess || session.testSuccess).length * 3 +
    sessions.filter((session) => session.detectedSkills.includes("vercel-deploy")).length * 3;

  const candidates: Array<[GrowthArchetype, number]> = [
    ["builder", builderScore],
    ["debugger", debuggerScore],
    ["prompt_master", promptScore >= 82 ? promptScore / 10 : 0],
    ["explorer", explorerScore],
    ["shipper", shipperScore],
  ];
  const ranked = candidates.sort((a, b) => b[1] - a[1]);

  return ranked[0][1] > 0 ? ranked[0][0] : "balanced";
}

export function detectSkillsFromEvidence(
  input: SkillEvidenceInput,
): SkillDetection[] {
  const dependencies = new Set(input.dependencies.map((item) => item.toLowerCase()));
  const files = input.filePaths.map((item) => normalizePath(item));
  const signals = input.contentSignals.map((item) => item.toLowerCase());
  const detections: SkillDetection[] = [];

  const add = (skillId: string, name: string, evidence: string[]) => {
    if (detections.some((item) => item.skillId === skillId)) return;
    detections.push({ skillId, name, evidence });
  };

  if (
    dependencies.has("electron") ||
    files.some((file) => /(^|\/)(main|electron)\.(ts|js)$/.test(file))
  ) {
    add("electron-desktop", "Electron 桌面端", ["electron"]);
  }

  if (
    dependencies.has("vite") ||
    files.some((file) => file.endsWith("vite.config.ts") || file.endsWith("vite.config.js"))
  ) {
    add("vite", "Vite", ["vite"]);
  }

  if (
    dependencies.has("tailwindcss") ||
    files.some((file) => file.includes("tailwind.config"))
  ) {
    add("tailwind", "Tailwind", ["tailwindcss"]);
  }

  if (dependencies.has("sqlite") || dependencies.has("better-sqlite3")) {
    add("local-database", "SQLite / 本地数据库", ["sqlite"]);
  }

  if (
    dependencies.has("axios") ||
    files.some((file) => file.includes("/api/") || file.endsWith("/api.ts")) ||
    signals.some((signal) => signal.includes("fetch(") || signal.includes("axios"))
  ) {
    add("api-integration", "API 接入", ["api"]);
  }

  if (files.some((file) => file.endsWith("vercel.json"))) {
    add("vercel-deploy", "Vercel 部署", ["vercel.json"]);
  }

  if (
    dependencies.has("vitest") ||
    dependencies.has("jest") ||
    files.some((file) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file))
  ) {
    add("testing", "测试能力", ["test"]);
  }

  const responsiveSignals = signals.filter((signal) =>
    ["mobile", "responsive", "@media", "sm:", "md:", "lg:"].some((needle) =>
      signal.includes(needle),
    ),
  );
  if (
    files.some((file) => file.includes("mobile") || file.includes("responsive")) ||
    responsiveSignals.length >= 1
  ) {
    add("responsive", "移动端适配", ["responsive"]);
  }

  if (
    files.some((file) => file.includes("storage") || file.includes("json-db")) ||
    signals.some((signal) => signal.includes("localstorage"))
  ) {
    add("local-storage", "本地存储", ["storage"]);
  }

  if (files.some((file) => file.startsWith(".github/workflows/") && file.endsWith(".yml"))) {
    add("ci-cd", "CI/CD", [".github/workflows"]);
  }

  if (files.some((file) => file.endsWith(".env.example"))) {
    add("env-management", "环境变量管理", [".env.example"]);
  }

  return detections;
}

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const current = summarizeWeek(input.currentSessions);
  const previous = summarizeWeek(input.previousSessions);
  const period = input.period ?? "weekly";
  const habitInsights = buildHabitInsights(period, trendFromComparison(current, previous), current, previous);
  const trend = habitInsights.trend;
  const summary = buildTrendSummary(period, trend, current, previous, habitInsights);

  return {
    reportId: `${period}_${input.startDate}_${input.endDate}`,
    period,
    startDate: input.startDate,
    endDate: input.endDate,
    aiCapabilityScore: input.aiCapabilityScore,
    trend,
    ...current,
    summary,
    habitSummary: habitInsights.habitSummary,
    optimizationAdvice: habitInsights.optimizationAdvice,
    nextPractice: habitInsights.nextPractice,
  };
}

function trendFromComparison(
  current: ReturnType<typeof summarizeWeek>,
  previous: ReturnType<typeof summarizeWeek>,
): Trend {
  const improvementCount = [
    current.effectiveSessions > previous.effectiveSessions,
    current.deliveredSessions > previous.deliveredSessions,
    current.breakthroughSessions > previous.breakthroughSessions,
    current.inactiveSessions < previous.inactiveSessions,
    current.buildSuccessRate > previous.buildSuccessRate,
    current.promptClarityAverage > previous.promptClarityAverage,
    current.newSkills > previous.newSkills,
  ].filter(Boolean).length;
  const declineCount = [
    current.effectiveSessions < previous.effectiveSessions,
    current.deliveredSessions < previous.deliveredSessions,
    current.breakthroughSessions < previous.breakthroughSessions,
    current.inactiveSessions > previous.inactiveSessions,
    current.buildSuccessRate < previous.buildSuccessRate,
    current.promptClarityAverage < previous.promptClarityAverage,
    current.newSkills < previous.newSkills,
  ].filter(Boolean).length;
  return improvementCount >= 2 ? "up" : declineCount >= 2 ? "down" : "flat";
}

export function summarizeWeek(sessions: WeeklySessionInput[]) {
  const sessionCount = sessions.length;
  const effectiveSessions = sessions.filter((session) =>
    ["working", "delivered", "breakthrough"].includes(session.status),
  ).length;
  const inactiveSessions = sessions.filter(
    (session) => session.status === "inactive",
  ).length;
  const deliveredSessions = sessions.filter((session) =>
    ["delivered", "breakthrough"].includes(session.status),
  ).length;
  const breakthroughSessions = sessions.filter(
    (session) => session.status === "breakthrough",
  ).length;
  const buildChecks = sessions.filter(
    (session) => session.buildSuccess || session.testSuccess,
  ).length;
  const promptClarityAverage = sessions.length
    ? Math.round(
        sessions.reduce((sum, session) => sum + session.promptClarityScore, 0) /
          sessions.length,
      )
    : 0;
  const newSkills = new Set(sessions.flatMap((session) => session.detectedSkills))
    .size;

  return {
    sessionCount,
    effectiveSessions,
    inactiveSessions,
    deliveredSessions,
    breakthroughSessions,
    newSkills,
    buildSuccessRate: sessions.length
      ? Math.round((buildChecks / sessions.length) * 100)
      : 0,
    promptClarityAverage,
  };
}

function buildTrendSummary(
  period: "daily" | "weekly",
  trend: Trend,
  current: ReturnType<typeof summarizeWeek>,
  previous: ReturnType<typeof summarizeWeek>,
  insights: HabitInsights,
): string {
  const periodText = period === "daily" ? "今日" : "本周";
  const trendText =
    trend === "up" ? `${periodText}上升` : trend === "down" ? `${periodText}下降` : `${periodText}暂无明显变化`;
  const comparison =
    current.sessionCount > 0 || previous.sessionCount > 0
      ? `使用闭环从 ${previous.deliveredSessions} 次变为 ${current.deliveredSessions} 次。`
      : "还没有可分析的使用记录。";
  return `你的 AI 使用能力${trendText}。${comparison}${insights.habitSummary}${insights.optimizationAdvice}`;
}

interface HabitInsights {
  trend: Trend;
  habitSummary: string;
  optimizationAdvice: string;
  nextPractice: string;
}

function buildHabitInsights(
  period: "daily" | "weekly",
  trend: Trend,
  current: ReturnType<typeof summarizeWeek>,
  previous: ReturnType<typeof summarizeWeek>,
): HabitInsights {
  const periodText = period === "daily" ? "今天" : "这周";
  const averageText = period === "daily" ? "昨天" : "上周";

  if (current.sessionCount === 0) {
    return {
      trend,
      habitSummary: `${periodText}还没有可分析的 Codex 使用习惯。`,
      optimizationAdvice: "先把一次使用缩小成一个明确目标，结束前留下可验证结果。",
      nextPractice: "下一次先写 1 句话目标、1 个范围、1 条验收标准，再开始让 Codex 动手。",
    };
  }

  const inactiveRatio = current.inactiveSessions / current.sessionCount;
  const deliveredRatio = current.deliveredSessions / current.sessionCount;
  const clarity = current.promptClarityAverage;

  let habitSummary: string;
  if (current.deliveredSessions === 0) {
    habitSummary = `${periodText}的主要习惯是开始使用 Codex，但还没有形成交付闭环。`;
  } else if (clarity >= 75 && current.deliveredSessions > 0) {
    habitSummary = `${periodText}你会把目标说清楚，也能把一部分任务完成闭环。`;
  } else if (inactiveRatio >= 0.5) {
    habitSummary = `${periodText}有不少使用停在打开或沟通阶段，真正推进项目的次数偏少。`;
  } else if (deliveredRatio >= 0.5) {
    habitSummary = `${periodText}你更像是在围绕结果使用 Codex，而不是单纯试工具。`;
  } else {
    habitSummary = `${periodText}已经有工作推进，但完成闭环的比例还不稳定。`;
  }

  const optimizationAdvice = chooseOptimizationAdvice(periodText, averageText, current, previous);
  const nextPractice = chooseNextPractice(current);

  return {
    trend,
    habitSummary,
    optimizationAdvice,
    nextPractice,
  };
}

function chooseOptimizationAdvice(
  periodText: string,
  averageText: string,
  current: ReturnType<typeof summarizeWeek>,
  previous: ReturnType<typeof summarizeWeek>,
): string {
  if (current.deliveredSessions === 0) {
    return `${periodText}最该优化的是收尾动作：不要只让 Codex 改，结束前一定要确认结果能用。`;
  }
  if (current.promptClarityAverage < 55) {
    return "你现在的目标描述偏散，容易让 Codex 先猜方向；先写清楚范围、限制和成功标准。";
  }
  if (current.inactiveSessions > previous.inactiveSessions && current.inactiveSessions > 0) {
    return `${periodText}比${averageText}更容易空转，建议每次开始前先决定一个很小的可完成结果。`;
  }
  if (current.deliveredSessions > 0 && current.breakthroughSessions === 0) {
    return "你已经能完成闭环，下一步要做的是复盘：哪类任务最顺、哪类任务最容易卡住。";
  }
  if (current.breakthroughSessions > 0) {
    return "这次有新动作被真正用起来，接下来要在相似任务里重复一次，避免只停留在偶然成功。";
  }
  return "继续减少空聊，把每次使用都压成明确的小目标、明确边界和明确结果。";
}

function chooseNextPractice(current: ReturnType<typeof summarizeWeek>): string {
  if (current.promptClarityAverage < 55) {
    return "下一次先写清目标：只改哪里、不要改哪里、完成后用什么标准验收。";
  }
  if (current.deliveredSessions === 0) {
    return "下一次只挑一个小任务，目标是从沟通走到一个可确认的结果。";
  }
  if (current.inactiveSessions > 0) {
    return "下一次减少试探性提问，直接给 Codex 一个可执行的小范围任务。";
  }
  if (current.breakthroughSessions === 0) {
    return "下一次在任务目标里提前写清验收标准，并在结束后做 30 秒复盘。";
  }
  return "下一次复用这次成功的指挥方式，看看能不能在同类问题里更快完成。";
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\/+/, "").toLowerCase();
}

function scoreLastPushed(lastPushedAt: string | null): number {
  if (!lastPushedAt) return 0;
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastPushedAt).getTime()) / 86_400_000),
  );
  if (ageDays <= 30) return 100;
  if (ageDays <= 90) return 80;
  if (ageDays <= 180) return 50;
  if (ageDays <= 365) return 25;
  return 5;
}

function scoreIssueHealth(openIssues: number, stars: number, pushedScore: number): number {
  if (stars === 0) return openIssues === 0 ? 40 : 10;
  const ratio = openIssues / stars;
  if (ratio > 0.25) return 10;
  if (ratio > 0.1) return 35;
  if (ratio > 0.03) return 70;
  if (pushedScore >= 50) return 90;
  return 65;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
