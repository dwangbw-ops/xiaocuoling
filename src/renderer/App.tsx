import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { visualStageForPet } from "../shared/petPresentation";
import { buildSessionNarrative } from "../shared/sessionNarrative";
import type {
  AppSnapshot,
  CodexEventEvidence,
  CodexSessionRecord,
  GrowthArchetype,
  PetStage,
  WeeklyReport,
} from "../shared/types";
import type { XiaocuolingApi } from "../preload/preload";

const stageCopy: Record<PetStage, string> = {
  egg: "你有 Codex 基础，但我还没看到真实交付。",
  chaos: "工具库很大，但还没有变成你的能力。",
  apprentice: "有一些交付证据，但还得继续验证。",
  maker: "你开始稳定留下交付闭环。",
  mage: "你能更清楚地指挥 Codex 完成验证。",
  creator: "你能持续把想法变成可运行的东西。",
};

const stageLabel: Record<PetStage, string> = {
  egg: "Lv.1 初醒小搓灵",
  chaos: "Lv.2 纸箱小搓灵",
  apprentice: "Lv.3 工具小搓灵",
  maker: "Lv.4 Prompt 小法师",
  mage: "Lv.5 造物小搓灵",
  creator: "Lv.6 高阶造物灵",
};

const archetypeLabel: Record<GrowthArchetype, string> = {
  builder: "建造型",
  debugger: "修 bug 型",
  prompt_master: "指令型",
  explorer: "探索型",
  shipper: "交付型",
  balanced: "均衡型",
};

const emptySnapshot: AppSnapshot = {
  projects: [],
  sessions: [],
  skills: [],
  petState: {
    stage: "egg",
    baselineStage: "egg",
    archetype: "balanced",
    exp: 0,
    purificationScore: 0,
    aiCapabilityScore: 0,
    currentMood: stageCopy.egg,
    unlockedItems: [],
    lastActiveDate: new Date(0).toISOString(),
    codexBaseline: null,
  },
  weeklyReports: [],
  activeSession: null,
  codexLink: null,
};

const commandShortcuts = [
  "npm run dev",
  "npm run build",
  "npm test",
  "git status",
  "git diff --stat",
  "git log --oneline -5",
];

const emptyCodexEvidence: CodexEventEvidence = {
  sessionStarted: false,
  userPromptSubmitted: false,
  hadFileEditTool: false,
  successfulCommands: 0,
  failedCommands: 0,
  buildSuccess: false,
  testSuccess: false,
  gitCommandSeen: false,
  stopSeen: false,
  shouldIncreasePurificationDirectly: false,
};

const requireDesktopRuntime = async (): Promise<never> => {
  throw new Error("当前页面没有 Electron 本地权限，无法读取真实 Codex 数据。请从桌面应用打开。");
};

const browserUnavailableApi: XiaocuolingApi = {
  getState: async () => emptySnapshot,
  getCommands: async () => commandShortcuts,
  openPanel: async () => emptySnapshot,
  resetData: requireDesktopRuntime,
  selectProject: requireDesktopRuntime,
  calibrateFromCodex: requireDesktopRuntime,
  getCodexLinkStatus: requireDesktopRuntime,
  connectCodexGlobal: requireDesktopRuntime,
  installCodexHooks: requireDesktopRuntime,
  getCodexHookEvents: async () => ({
    events: [],
    evidence: emptyCodexEvidence,
  }),
  disconnectCodex: requireDesktopRuntime,
  startSession: requireDesktopRuntime,
  endSession: requireDesktopRuntime,
  runCommand: requireDesktopRuntime,
  onStateUpdated: () => () => undefined,
};

const xiaocuoling = window.xiaocuoling ?? browserUnavailableApi;

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const view = new URLSearchParams(window.location.search).get("view") ?? "panel";

  useEffect(() => {
    document.body.dataset.view = view;
    document.documentElement.dataset.view = view;
    xiaocuoling.getState().then(setSnapshot);
    return xiaocuoling.onStateUpdated(setSnapshot);
  }, [view]);

  if (view === "pet") {
    return <PetWindow snapshot={snapshot} />;
  }

  return <MainPanel snapshot={snapshot} onSnapshot={setSnapshot} />;
}

function PetWindow({ snapshot }: { snapshot: AppSnapshot }) {
  const stage = visualStageForPet(snapshot.petState, snapshot.sessions);
  const badgeValue = desktopPetBadge(snapshot);
  return (
    <main className="pet-window">
      <button
        className="pet-open-button"
        type="button"
        onClick={() => xiaocuoling.openPanel()}
        title="打开小搓灵主面板"
      >
        <PetAvatar stage={stage} archetype={snapshot.petState.archetype} compact />
        <span>{badgeValue}</span>
        <em>{petHoverLine(snapshot)}</em>
      </button>
    </main>
  );
}

function MainPanel({
  snapshot,
  onSnapshot,
}: {
  snapshot: AppSnapshot;
  onSnapshot: (snapshot: AppSnapshot) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const latestSession = snapshot.sessions.find((session) => session.endTime);
  const latestReport = snapshot.weeklyReports.find((report) => report.period === "daily")
    ?? snapshot.weeklyReports.find((report) => (report.period ?? "weekly") === "weekly")
    ?? null;

  const completedSessions = snapshot.sessions.filter((session) => session.endTime);
  const hasRealSessions = completedSessions.length > 0;
  const nextStage = nextStageInfo(snapshot.petState.purificationScore);
  const visualStage = visualStageForPet(snapshot.petState, snapshot.sessions);
  const growthScore = hasRealSessions ? snapshot.petState.aiCapabilityScore : "暂无";
  const weekTrend = hasRealSessions && latestReport ? trendLabel(latestReport.trend) : "暂无数据";

  const handleOneClickCodexConnect = async () => {
    setBusy("codex-connect-all");
    setError("");
    try {
      const result = await xiaocuoling.connectCodexGlobal();
      onSnapshot(result.snapshot);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="panel-shell">
      <header className="panel-topbar">
        <div>
          <p className="eyebrow">小搓灵 · Codex 能力成长宠物</p>
          <h1>你的 Codex 成长镜像</h1>
        </div>
      </header>

      <section className="overview-grid">
        <div className="growth-card">
          <div className="pet-stage-wrap">
            <PetAvatar stage={visualStage} archetype={snapshot.petState.archetype} />
          </div>
          <div className="growth-copy">
            <p className="eyebrow">宠物成长</p>
            <h2>{petDisplayName(visualStage, snapshot.petState.archetype)}</h2>
            <p className="stage-line">{archetypeLabel[snapshot.petState.archetype]}</p>
            <p className="feedback-line">
              {latestSession?.feedback ?? snapshot.petState.currentMood}
            </p>
            <div className="progress-row">
              <span>净化值 {Math.round(snapshot.petState.purificationScore)}</span>
              <span>{nextStage ? `距离 ${stageLabel[nextStage.stage]} 还差 ${nextStage.remaining}` : "已满阶"}</span>
            </div>
            <div className="progress-track">
              <div style={{ width: `${nextStage?.progress ?? 100}%` }} />
            </div>
          </div>
        </div>

        <div className="score-grid compact-score-grid">
          <Metric label="当前等级" value={stageLabel[visualStage]} />
          <Metric label="AI 使用能力" value={growthScore} />
          <Metric label="净化值" value={Math.round(snapshot.petState.purificationScore)} />
          <Metric label="趋势" value={weekTrend} />
        </div>
      </section>

      <section className="read-console">
        {error ? <p className="error-line">{error}</p> : null}
        <ReadCodexButton busy={busy} onConnectAll={handleOneClickCodexConnect} />
      </section>

      <section className="detail-grid">
        <AbilityReportsBlock reports={hasRealSessions ? snapshot.weeklyReports : []} />
        <Timeline sessions={snapshot.sessions} />
      </section>
    </main>
  );
}

function ReadCodexButton({
  busy,
  onConnectAll,
}: {
  busy: string | null;
  onConnectAll: () => void;
}) {
  return (
    <button
      className="connect-all-button minimal-read-button"
      type="button"
      disabled={busy !== null}
      onClick={onConnectAll}
    >
      {busy === "codex-connect-all" ? "正在读取..." : "读取全部 Codex 使用过程"}
    </button>
  );
}

function PetAvatar({
  stage,
  archetype = "balanced",
  compact = false,
}: {
  stage: PetStage;
  archetype?: GrowthArchetype;
  compact?: boolean;
}) {
  const level = petLevelForStage(stage);
  return (
    <div
      className={`pet-avatar black-purple-spirit pet-level-${level} archetype-${archetype} ${compact ? "compact" : ""}`}
    >
      <svg viewBox="0 0 180 180" role="img" aria-label={stageLabel[stage]}>
        <BlackPurpleSpirit level={level} />
      </svg>
    </div>
  );
}

function BlackPurpleSpirit({ level }: { level: number }) {
  return (
    <>
      <ellipse className="xcl-baseplate" cx="91" cy="150" rx="54" ry="13" />
      <circle className="xcl-particle p1" cx="40" cy="58" r="3" />
      <circle className="xcl-particle p2" cx="145" cy="70" r="2.4" />
      <circle className="xcl-particle p3" cx="132" cy="34" r="2" />
      <text className="xcl-code c1" x="34" y="96">{`{}`}</text>
      <text className="xcl-code c2" x="126" y="112">run</text>
      {level >= 6 ? <path className="xcl-file-tree" d="M126 45h25M138 45v20M126 65h25M138 65v18M126 83h25" /> : null}
      {level >= 5 ? <path className="xcl-halo" d="M57 42c18-12 51-12 69 0" /> : null}
      {level >= 5 ? <path className="xcl-cloak" d="M48 125c17 27 69 28 88 0-11 24-26 36-45 36-20 0-34-12-43-36Z" /> : null}
      <path className="xcl-tail" d="M130 111c21 2 26-19 11-25" />
      <path className="xcl-ear left" d="M61 57 48 27l30 16Z" />
      <path className="xcl-ear right" d="M120 47l30-19-10 33Z" />
      <path className="xcl-body" d="M48 97c0-36 20-61 49-61 31 0 53 26 51 63-1 35-22 53-51 53-30 0-49-19-49-55Z" />
      <path className="xcl-face-glow" d="M62 92c7-25 24-38 42-34 20 4 32 24 25 47-7 22-25 33-45 28-17-4-27-19-22-41Z" />
      <ellipse className="xcl-eye blink" cx="79" cy="89" rx="10" ry="14" />
      <ellipse className="xcl-eye blink" cx="111" cy="89" rx="10" ry="14" />
      <circle className="xcl-eye-shine" cx="76" cy="84" r="3" />
      <circle className="xcl-eye-shine" cx="108" cy="84" r="3" />
      <path className="xcl-smile" d="M83 118c6 5 18 5 25 0" />
      {level >= 2 ? <rect className="xcl-box-chip" x="43" y="123" width="27" height="20" rx="5" /> : null}
      {level >= 2 ? <path className="xcl-terminal-chip" d="M117 123h30v18h-30Z" /> : null}
      {level >= 2 ? <text className="xcl-mini-code" x="123" y="136">&gt;_</text> : null}
      {level >= 3 ? <path className="xcl-toolbag" d="M118 111h29v27h-29Z" /> : null}
      {level >= 3 ? <path className="xcl-tool-line" d="M126 111v-7h13v7M124 126h17" /> : null}
      {level >= 4 ? <path className="xcl-staff" d="M141 58v77M132 65h18M136 58l5-8 6 8" /> : null}
      {level >= 4 ? <text className="xcl-rune" x="51" y="55">{`{}`}</text> : null}
    </>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function Timeline({ sessions }: { sessions: CodexSessionRecord[] }) {
  const completed = sessions.filter((session) => session.endTime).slice(0, 8);
  return (
    <section className="info-panel">
      <h2>最近 Codex 使用记录</h2>
      {completed.length ? (
        <ol className="timeline">
          {completed.map((session) => {
            const narrative = buildSessionNarrative(session);
            return (
              <li key={session.sessionId}>
                <div className="timeline-heading">
                  <strong>{narrative.projectName}</strong>
                  <span>{new Date(session.endTime as string).toLocaleString()}</span>
                </div>
                <p>{narrative.goal}</p>
                <ul className="timeline-work-list">
                  {narrative.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <small>
                  状态 {statusLabel(session.status)} · 得分 +{session.score}
                </small>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">还没有真实 Codex 使用记录。</p>
      )}
    </section>
  );
}

function AbilityReportsBlock({ reports }: { reports: WeeklyReport[] }) {
  const dailyReport = reports.find((report) => report.period === "daily") ?? null;
  const weeklyReport =
    reports.find((report) => (report.period ?? "weekly") === "weekly") ?? null;

  return (
    <section className="info-panel report-panel">
      <h2>AI 使用能力报告</h2>
      {dailyReport || weeklyReport ? (
        <div className="ability-report-stack">
          <ReportSummary label="今晚日报" report={dailyReport} empty="今晚 21:00 后生成日报。" />
          <ReportSummary label="周末周报" report={weeklyReport} empty="周日 21:00 后生成周报。" />
        </div>
      ) : (
        <p className="muted">暂无数据。日报会在每天晚上生成，周报会在周末晚上生成。</p>
      )}
    </section>
  );
}

function ReportSummary({
  label,
  report,
  empty,
}: {
  label: string;
  report: WeeklyReport | null;
  empty: string;
}) {
  if (!report) {
    return (
      <div className="report-summary-card">
        <strong>{label}</strong>
        <p className="muted">{empty}</p>
      </div>
    );
  }

  if (!hasRealReportInsights(report)) {
    return (
      <div className="report-summary-card">
        <strong>{label}</strong>
        <p className="muted">这份报告没有真实习惯分析字段。等待下一次日报或周报生成后再展示。</p>
      </div>
    );
  }

  return (
    <div className="report-summary-card">
      <div className="report-card-heading">
        <strong>{label}</strong>
        <span>{trendText(report.trend)}</span>
      </div>
      <div className="report-insight-list">
        <ReportInsight label="使用习惯" text={report.habitSummary} />
        <ReportInsight label="优化方向" text={report.optimizationAdvice} />
        <ReportInsight label="下一次练习" text={report.nextPractice} />
      </div>
      <p className="report-note">{report.summary}</p>
    </div>
  );
}

function hasRealReportInsights(report: WeeklyReport) {
  return [report.habitSummary, report.optimizationAdvice, report.nextPractice].every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

function ReportInsight({ label, text }: { label: string; text: string }) {
  return (
    <div className="report-insight">
      <span>{label}</span>
      <p>{text}</p>
    </div>
  );
}

function trendText(trend: WeeklyReport["trend"]) {
  if (trend === "up") return "变好";
  if (trend === "down") return "变弱";
  return "暂无明显变化";
}

function trendLabel(trend?: string) {
  if (trend === "up") return "上升";
  if (trend === "down") return "下降";
  if (trend === "flat") return "停滞";
  return "暂无数据";
}

function userFacingError(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : String(caught);
  if (/EMFILE|too many open files/i.test(raw)) {
    return "连接时打开文件过多。已改为流式读取，请重新点一次“一键读取全部 Codex 使用过程”。";
  }
  return raw.replace(/^Error invoking remote method '[^']+':\s*/i, "");
}

function petDisplayName(stage: PetStage, archetype: GrowthArchetype): string {
  void archetype;
  return stageLabel[stage];
}

function petLevelForStage(stage: PetStage): number {
  const levels: Record<PetStage, number> = {
    egg: 1,
    chaos: 2,
    apprentice: 3,
    maker: 4,
    mage: 5,
    creator: 6,
  };
  return levels[stage];
}

function petHoverLine(snapshot: AppSnapshot): string {
  if (!snapshot.sessions.some((session) => session.endTime) && snapshot.petState.codexBaseline) {
    return "已读取 Codex 基础镜像。";
  }
  if (!snapshot.sessions.some((session) => session.endTime)) return "还没看到交付呢。";
  if (snapshot.weeklyReports[0]?.trend === "up") return "今天有点变强。";
  return "先跑一次 build。";
}

function desktopPetBadge(snapshot: AppSnapshot): string {
  return `Lv.${petLevelForStage(visualStageForPet(snapshot.petState, snapshot.sessions))}`;
}

function nextStageInfo(score: number): { stage: PetStage; remaining: number; progress: number } | null {
  const thresholds: Array<{ stage: PetStage; start: number; end: number }> = [
    { stage: "egg", start: 0, end: 30 },
    { stage: "chaos", start: 31, end: 100 },
    { stage: "apprentice", start: 101, end: 220 },
    { stage: "maker", start: 221, end: 400 },
    { stage: "mage", start: 401, end: 700 },
    { stage: "creator", start: 701, end: Number.POSITIVE_INFINITY },
  ];
  const currentIndex = thresholds.findIndex((item) => score >= item.start && score <= item.end);
  const current = thresholds[currentIndex] ?? thresholds[0];
  const next = thresholds[currentIndex + 1];
  if (!next) return null;
  const span = current.end - current.start + 1;
  return {
    stage: next.stage,
    remaining: Math.max(0, Math.ceil(next.start - score)),
    progress: Math.min(100, Math.max(0, ((score - current.start) / span) * 100)),
  };
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    inactive: "inactive",
    unverified: "unverified",
    working: "working",
    delivered: "delivered",
    breakthrough: "breakthrough",
  };
  return labels[status] ?? status;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
