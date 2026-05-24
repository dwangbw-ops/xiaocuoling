import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import {
  emptyGithubSkillRecommendations,
  normalizeGithubSkillRecommendations,
} from "../shared/githubRecommendationView";
import { buildSessionNarrative } from "../shared/sessionNarrative";
import {
  buildToyGrowthPresentation,
  petLevelForStage,
  stageLabel,
} from "../shared/toyGrowthPresentation";
import type {
  AppSnapshot,
  CodexEventEvidence,
  CodexSessionRecord,
  GrowthArchetype,
  PetStage,
  WeeklyReport,
} from "../shared/types";
import type { XiaocuolingApi } from "../preload/preload";

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
    currentMood: "你有 Codex 基础，但我还没看到真实交付。",
    unlockedItems: [],
    lastActiveDate: new Date(0).toISOString(),
    codexBaseline: null,
  },
  weeklyReports: [],
  githubSkillRecommendations: emptyGithubSkillRecommendations,
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
  const presentation = buildToyGrowthPresentation(snapshot);
  const badgeValue = desktopPetBadge(snapshot);
  return (
    <main className="pet-window">
      <button
        className="pet-open-button"
        type="button"
        onClick={() => xiaocuoling.openPanel()}
        title="打开小搓灵主面板"
      >
        <PetAvatar stage={presentation.stage} archetype={snapshot.petState.archetype} compact />
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
  const presentation = buildToyGrowthPresentation(snapshot);
  const latestReport = snapshot.weeklyReports.find((report) => report.period === "daily")
    ?? snapshot.weeklyReports.find((report) => (report.period ?? "weekly") === "weekly")
    ?? null;

  const completedSessions = snapshot.sessions.filter((session) => session.endTime);
  const hasRealSessions = completedSessions.length > 0;
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
          <h1>AI 能力成长潮玩展示柜</h1>
        </div>
        <div className="level-pill">
          <span>{presentation.stageName}</span>
          <strong>{presentation.archetypeName}</strong>
        </div>
      </header>

      <section className="toy-hero-grid">
        <div className="toy-showcase-card">
          <div className="toy-light-ring" />
          <div className="toy-stage-copy">
            <span>当前形态</span>
            <strong>{presentation.stageName}</strong>
            <p>{presentation.feedback}</p>
          </div>
          <div className="toy-display-plinth">
            <PetAvatar stage={presentation.stage} archetype={snapshot.petState.archetype} />
            <div className="acrylic-base">
              <span>Lv.{presentation.level}</span>
              <small>purify {presentation.purification}</small>
            </div>
          </div>
          <div className="growth-orbit">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="growth-dashboard">
          <section className="report-hero-card">
            <p className="eyebrow">能力报告摘要</p>
            <h2>{hasRealSessions ? abilityHeadline(latestReport) : "你有 Codex 基础，但我还没看到真实交付。"}</h2>
            <p>{hasRealSessions ? abilityAdvice(latestReport) : "读取后会只展示真实 session、交付证据和使用习惯，不用工具清单冒充成长。"}</p>
          </section>

          <div className="score-grid toy-score-grid">
            <Metric label="当前等级" value={`Lv.${presentation.level}`} />
            <Metric label="AI 使用能力" value={presentation.growthScore} />
            <Metric label="净化值" value={presentation.purification} />
            <Metric label="本周趋势" value={weekTrend} />
          </div>

          <section className="next-stage-card">
            <div>
              <span>下一阶段</span>
              <strong>
                {presentation.nextStage
                  ? `${presentation.nextStage.label} · 还差 ${presentation.nextStage.remaining}`
                  : "已满阶"}
              </strong>
            </div>
            <div className="progress-track energy-track">
              <div style={{ width: `${presentation.nextStage?.progress ?? 100}%` }} />
            </div>
          </section>

          <RecentMemoryCard memory={presentation.recentMemory} />
        </div>
      </section>

      <section className="read-console">
        {error ? <p className="error-line">{error}</p> : null}
        <ReadCodexButton busy={busy} onConnectAll={handleOneClickCodexConnect} />
      </section>

      <section className="detail-grid">
        <AbilityReportsBlock reports={hasRealSessions ? snapshot.weeklyReports : []} />
        <GithubSkillRecommendationsBlock snapshot={snapshot} />
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

function RecentMemoryCard({
  memory,
}: {
  memory: { project: string; goal: string; items: string[] } | null;
}) {
  return (
    <section className="recent-memory-card">
      <div className="memory-card-head">
        <span>最近一次成长记忆</span>
        <strong>{memory ? memory.project : "暂无真实交付"}</strong>
      </div>
      {memory ? (
        <>
          <p>{memory.goal}</p>
          <ul>
            {memory.items.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>读取 Codex 后，这里只显示真实项目、真实整改方向和交付结果。</p>
      )}
    </section>
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
    <section className="info-panel timeline-panel">
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

function GithubSkillRecommendationsBlock({ snapshot }: { snapshot: AppSnapshot }) {
  const github = normalizeGithubSkillRecommendations(snapshot.githubSkillRecommendations);
  return (
    <section className="info-panel github-recommend-panel">
      <h2>GitHub Skill 推荐</h2>
      {github.error ? <p className="muted">GitHub API 获取失败：{github.error}</p> : null}
      {!github.error && !github.fetchedAt ? (
        <p className="muted">点击读取后，从 GitHub API 获取真实推荐。</p>
      ) : null}
      {!github.error && github.fetchedAt && !github.recommendations.length ? (
        <p className="muted">这次 GitHub API 没有返回符合条件的 Skill 仓库。</p>
      ) : null}
      {github.recommendations.length ? (
        <ul className="github-recommend-list">
          {github.recommendations.map((item) => (
            <li key={item.fullName}>
              <a href={item.htmlUrl} target="_blank" rel="noreferrer">
                {item.fullName}
              </a>
              <span>
                {item.stars.toLocaleString()} stars
                {item.starGainSinceLastScan === null
                  ? " · 暂无增长基线"
                  : ` · +${item.starGainSinceLastScan} stars`}
              </span>
              <p>{item.description || "GitHub API 未返回描述。"}</p>
              <small>最近更新 {item.pushedAt ? new Date(item.pushedAt).toLocaleDateString() : "未记录"}</small>
            </li>
          ))}
        </ul>
      ) : null}
      {github.fetchedAt ? (
        <p className="report-note">
          来源 GitHub API · 阈值 {github.minStars}+ stars · {new Date(github.fetchedAt).toLocaleString()}
        </p>
      ) : null}
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

function abilityHeadline(report: WeeklyReport | null) {
  if (!report || !hasRealReportInsights(report)) {
    return "已读取真实记录，等待下一次日报形成习惯判断。";
  }
  return report.habitSummary;
}

function abilityAdvice(report: WeeklyReport | null) {
  if (!report || !hasRealReportInsights(report)) {
    return "继续留下清晰目标、运行验证和交付结果，小搓灵才会把它记成成长。";
  }
  return report.optimizationAdvice;
}

function userFacingError(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : String(caught);
  if (/EMFILE|too many open files/i.test(raw)) {
    return "连接时打开文件过多。已改为流式读取，请重新点一次“一键读取全部 Codex 使用过程”。";
  }
  return raw.replace(/^Error invoking remote method '[^']+':\s*/i, "");
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
  return `Lv.${buildToyGrowthPresentation(snapshot).level}`;
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
