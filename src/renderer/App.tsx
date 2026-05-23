import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { buildCapabilitySections } from "../shared/capabilityDisplay";
import { codexConnectionPrimaryAction } from "../shared/codexConnectionUi";
import { visualStageForPet } from "../shared/petPresentation";
import type {
  AppSnapshot,
  CodexEventEvidence,
  CodexHookEvent,
  CodexLinkStatus,
  CodexSessionRecord,
  CommandRecord,
  GrowthArchetype,
  PetStage,
  SkillRecord,
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

const demoCommands = [
  "npm run dev",
  "npm run build",
  "npm test",
  "git status",
  "git diff --stat",
  "git log --oneline -5",
];

type ToolLibraryTab = "skills" | "plugins" | "mcp" | "events" | "github";

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

const demoCommand: CommandRecord = {
  command: "npm run build",
  startTime: "2026-05-23T05:12:00.000Z",
  endTime: "2026-05-23T05:12:28.000Z",
  exitCode: 0,
  success: true,
  outputSummary: "展示版摘要：build completed successfully.",
};

const demoSnapshot: AppSnapshot = {
  projects: [
    {
      projectId: "demo_project",
      name: "小搓灵展示项目",
      path: "公开展示版不连接本机路径",
      createdAt: "2026-05-23T05:00:00.000Z",
      lastOpenedAt: "2026-05-23T05:20:00.000Z",
    },
  ],
  sessions: [
    {
      sessionId: "demo_session_breakthrough",
      projectId: "demo_project",
      projectPath: "公开展示版不连接本机路径",
      taskGoal:
        "只实现桌面端 Codex 能力成长宠物 MVP，保留本地 JSON 存储，不接后端，不读取 Codex 私有聊天内容，完成后 npm run build 通过。",
      startTime: "2026-05-23T05:00:00.000Z",
      endTime: "2026-05-23T05:20:00.000Z",
      duration: 1200000,
      beforeCommitHash: "demo-before",
      beforeGitStatus: "clean",
      beforePackageJsonDependencies: [],
      beforeFileSnapshot: {},
      afterCommitHash: "demo-after",
      afterGitStatus: "modified",
      afterPackageJsonDependencies: ["electron", "vite", "tailwindcss", "chokidar"],
      afterFileSnapshot: {},
      changedFilesCount: 18,
      addedFilesCount: 10,
      deletedFilesCount: 0,
      modifiedFilesCount: 8,
      newDependencies: ["electron", "chokidar"],
      detectedSkills: ["electron-desktop", "local-storage", "testing"],
      commandsRun: [demoCommand],
      successfulCommands: 1,
      failedCommands: 0,
      buildSuccess: true,
      testSuccess: true,
      gitCommitCreated: false,
      status: "breakthrough",
      score: 100,
      promptClarityScore: 92,
      feedback: "你解锁了新的能力，我的身体被净化了一块。",
    },
  ],
  skills: [
    {
      skillId: "electron-desktop",
      name: "Electron 桌面端",
      source: "local",
      githubRepo: "",
      firstDetectedAt: "2026-05-23T05:20:00.000Z",
      lastUsedAt: "2026-05-23T05:20:00.000Z",
      detectedCount: 2,
      deliveredCount: 1,
      breakthroughCount: 1,
      qualityScore: null,
      usageScore: 25,
      sourceSessionId: "demo_session_breakthrough",
      sourceProjectId: "demo_project",
      evidence: ["electron"],
      qualityEvidence: {
        stars: 0,
        forks: 0,
        openIssues: 0,
        lastPushedAt: null,
        hasReadme: false,
        hasExamples: false,
        hasLicense: false,
        repoAgeDays: 0,
      },
      level: 0,
    },
    {
      skillId: "local-storage",
      name: "本地存储",
      source: "local",
      githubRepo: "",
      firstDetectedAt: "2026-05-23T05:20:00.000Z",
      lastUsedAt: "2026-05-23T05:20:00.000Z",
      detectedCount: 2,
      deliveredCount: 1,
      breakthroughCount: 1,
      qualityScore: null,
      usageScore: 25,
      sourceSessionId: "demo_session_breakthrough",
      sourceProjectId: "demo_project",
      evidence: ["json db"],
      qualityEvidence: {
        stars: 0,
        forks: 0,
        openIssues: 0,
        lastPushedAt: null,
        hasReadme: false,
        hasExamples: false,
        hasLicense: false,
        repoAgeDays: 0,
      },
      level: 0,
    },
    {
      skillId: "testing",
      name: "测试能力",
      source: "local",
      githubRepo: "",
      firstDetectedAt: "2026-05-23T05:20:00.000Z",
      lastUsedAt: "2026-05-23T05:20:00.000Z",
      detectedCount: 1,
      deliveredCount: 1,
      breakthroughCount: 1,
      qualityScore: null,
      usageScore: 25,
      sourceSessionId: "demo_session_breakthrough",
      sourceProjectId: "demo_project",
      evidence: ["vitest"],
      qualityEvidence: {
        stars: 0,
        forks: 0,
        openIssues: 0,
        lastPushedAt: null,
        hasReadme: false,
        hasExamples: false,
        hasLicense: false,
        repoAgeDays: 0,
      },
      level: 0,
    },
  ],
  petState: {
    stage: "chaos",
    baselineStage: "maker",
    archetype: "builder",
    exp: 120,
    purificationScore: 23,
    aiCapabilityScore: 37,
    currentMood: "我还没完全净化，但这次有真实交付证据。",
    unlockedItems: ["Electron 桌面端", "本地存储", "测试能力"],
    lastActiveDate: "2026-05-23T05:20:00.000Z",
    codexBaseline: {
      capturedAt: "2026-05-23T05:20:00.000Z",
      codexHome: "公开展示版不读取本机目录",
      codexHomePresent: true,
      configPresent: true,
      customSkillCount: 46,
      pluginSkillCount: 89,
      bundledSkillCount: 5,
      sampledSkillNames: ["electron", "vite", "tailwind", "testing"],
      aiCapabilityScore: 84,
      purificationFloor: 0,
      expFloor: 0,
      summary:
        "公开展示版：按本机 Codex 元数据校准后的展示状态，自定义技能 46 个，插件技能 89 个，基础技能 5 个。",
    },
  },
  weeklyReports: [
    {
      reportId: "demo_week",
      startDate: "2026-05-17",
      endDate: "2026-05-23",
      aiCapabilityScore: 84,
      trend: "up",
      effectiveSessions: 5,
      inactiveSessions: 1,
      deliveredSessions: 3,
      breakthroughSessions: 1,
      newSkills: 3,
      buildSuccessRate: 67,
      promptClarityAverage: 84,
      summary:
        "你的 Codex 能力本周上升。有效 session 增加，交付闭环增加，新增 Electron、本地存储和测试能力。仍有 1 次 session 没有留下可验证成果。",
    },
  ],
  activeSession: null,
  codexLink: {
    codexCliDetected: true,
    codexVersion: "codex demo",
    configPath: "公开展示版",
    configExists: true,
    projectHooksCanInstall: false,
    projectHooksInstalled: false,
    projectHookPath: "",
    recentEventCount: 0,
    latestEventAt: null,
    latestSessionId: "",
    connectionMode: "manual",
    privacyNotice:
      "我不会读取 Codex 宠物，也不会复制它。我只观察你是否真的用 Codex 完成交付。",
  },
};

const browserDemoApi: XiaocuolingApi = {
  getState: async () => demoSnapshot,
  getCommands: async () => demoCommands,
  openPanel: async () => demoSnapshot,
  resetData: async () => demoSnapshot,
  selectProject: async () => demoSnapshot,
  calibrateFromCodex: async () => demoSnapshot,
  getCodexLinkStatus: async () => demoSnapshot.codexLink as CodexLinkStatus,
  connectCodexGlobal: async () => ({
    snapshot: demoSnapshot,
    status: demoSnapshot.codexLink as CodexLinkStatus,
    events: [],
  }),
  installCodexHooks: async () => demoSnapshot.codexLink as CodexLinkStatus,
  getCodexHookEvents: async () => ({
    events: [],
    evidence: emptyCodexEvidence,
  }),
  disconnectCodex: async () => demoSnapshot.codexLink as CodexLinkStatus,
  startSession: async () => ({
    ...demoSnapshot,
    activeSession: demoSnapshot.sessions[0],
  }),
  endSession: async () => demoSnapshot,
  runCommand: async (command) => ({
    snapshot: demoSnapshot,
    command: {
      ...demoCommand,
      command,
    },
  }),
  onStateUpdated: () => () => undefined,
};

const xiaocuoling = window.xiaocuoling ?? browserDemoApi;

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
  const [codexLinkStatus, setCodexLinkStatus] = useState<CodexLinkStatus | null>(
    snapshot.codexLink,
  );
  const [codexEvents, setCodexEvents] = useState<CodexHookEvent[]>([]);
  const [codexConnectionMessage, setCodexConnectionMessage] = useState("");
  const [toolLibraryOpen, setToolLibraryOpen] = useState(false);
  const [toolLibraryTab, setToolLibraryTab] = useState<ToolLibraryTab>("skills");
  const latestSession = snapshot.sessions.find((session) => session.endTime);
  const latestWeeklyReport =
    snapshot.weeklyReports.find((report) => (report.period ?? "weekly") === "weekly") ?? null;

  useEffect(() => {
    let ignore = false;
    xiaocuoling
      .getCodexLinkStatus()
      .then((status) => {
        if (!ignore) setCodexLinkStatus(status);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, []);

  const completedSessions = snapshot.sessions.filter((session) => session.endTime);
  const hasRealSessions = completedSessions.length > 0;
  const nextStage = nextStageInfo(snapshot.petState.purificationScore);
  const visualStage = visualStageForPet(snapshot.petState, snapshot.sessions);
  const codexBaseScore = snapshot.petState.codexBaseline?.aiCapabilityScore ?? "未读取";
  const growthScore = hasRealSessions ? snapshot.petState.aiCapabilityScore : "暂无";
  const weekTrend = hasRealSessions && latestWeeklyReport ? trendLabel(latestWeeklyReport.trend) : "暂无数据";

  const runAction = async (label: string, action: () => Promise<AppSnapshot>) => {
    setBusy(label);
    setError("");
    try {
      onSnapshot(await action());
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setBusy(null);
    }
  };

  const handleViewCodexEvents = async () => {
    setBusy("codex-events");
    setError("");
    try {
      const result = await xiaocuoling.getCodexHookEvents(20);
      setCodexEvents(result.events);
      setCodexConnectionMessage(feedbackForCodexEvidence(result.events[0], result.evidence));
      setCodexLinkStatus(await xiaocuoling.getCodexLinkStatus());
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setBusy(null);
    }
  };

  const handleOneClickCodexConnect = async () => {
    setBusy("codex-connect-all");
    setError("");
    try {
      const result = await xiaocuoling.connectCodexGlobal();
      onSnapshot(result.snapshot);
      setCodexLinkStatus(result.status);
      setCodexEvents(result.events);
      setCodexConnectionMessage(
        result.status.capabilityAnalysis?.summary ??
          "已读取本机 Codex 使用过程，安装全局捕获脚本，并刷新事件库。",
      );
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
        <div className="topbar-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={busy !== null}
            onClick={() => setToolLibraryOpen(true)}
          >
            设置
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy !== null}
            onClick={() => runAction("reset", () => xiaocuoling.resetData())}
          >
            重置数据
          </button>
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
              {petFeedbackLine(snapshot, latestSession, codexLinkStatus)}
            </p>
            <div className="progress-row">
              <span>净化值 {Math.round(snapshot.petState.purificationScore)}</span>
              <span>{nextStage ? `距离 ${stageLabel[nextStage.stage]} 还差 ${nextStage.remaining}` : "已满阶"}</span>
            </div>
            <div className="progress-track">
              <div style={{ width: `${nextStage?.progress ?? 100}%` }} />
            </div>
            <p className="microcopy">净化值只根据真实 Session、运行验证、交付闭环和持续进步缓慢增加。</p>
            <div className="today-suggestion">
              <span>今日建议</span>
              <strong>{todaySuggestion(snapshot, codexLinkStatus)}</strong>
            </div>
          </div>
        </div>

        <div className="score-grid compact-score-grid">
          <Metric
            label="Codex 基础分"
            value={codexBaseScore}
            hint="来自本地 Codex 环境、工具配置和项目环境，只代表基础条件。"
          />
          <Metric
            label="小搓灵成长分"
            value={growthScore}
            hint="来自真实 Session、运行验证、交付闭环和持续进步。"
          />
          <Metric
            label="净化值"
            value={Math.round(snapshot.petState.purificationScore)}
            hint="只根据真实成长缓慢增加。"
          />
          <Metric label="本周趋势" value={weekTrend} hint="没有真实 session 时不判定停滞。" />
        </div>
      </section>

      <section className="truth-strip" aria-label="成长规则">
        <span>检测到工具 ≠ 掌握工具</span>
        <span>打开 Codex ≠ 有效成长</span>
        <span>交付成功，才会净化</span>
      </section>

      <section className="session-console">
        {error ? <p className="error-line">{error}</p> : null}
        <CodexConnectionPanel
          status={codexLinkStatus}
          latestEffectiveSession={completedSessions.find((session) =>
            ["working", "delivered", "breakthrough"].includes(session.status),
          )}
          events={codexEvents}
          message={codexConnectionMessage}
          busy={busy}
          onConnectAll={handleOneClickCodexConnect}
        />
      </section>

      <ToolLibraryDrawer
        open={toolLibraryOpen}
        tab={toolLibraryTab}
        onTabChange={(nextTab) => {
          setToolLibraryTab(nextTab);
          if (nextTab === "events") void handleViewCodexEvents();
        }}
        onClose={() => setToolLibraryOpen(false)}
        snapshot={snapshot}
        status={codexLinkStatus}
        events={codexEvents}
      />

      <section className="detail-grid">
        <Timeline sessions={snapshot.sessions} />
        <UsedToolsList snapshot={snapshot} />
        <AbilityReportsBlock reports={hasRealSessions ? snapshot.weeklyReports : []} />
      </section>
    </main>
  );
}

function CodexConnectionPanel({
  status,
  latestEffectiveSession,
  events,
  message,
  busy,
  onConnectAll,
}: {
  status: CodexLinkStatus | null;
  latestEffectiveSession?: CodexSessionRecord;
  events: CodexHookEvent[];
  message: string;
  busy: string | null;
  onConnectAll: () => void;
}) {
  const action = codexConnectionPrimaryAction();

  return (
    <section className="codex-link-card">
      <div className="codex-link-head">
        <div>
          <p className="eyebrow">Codex 连接</p>
          <h2>连接真实行为，不复制官方宠物</h2>
        </div>
        <span className="connection-pill">
          当前连接方式：{status?.connectionMode === "hooks" ? "全局 Codex 记录" : "等待连接"}
        </span>
      </div>

      <div className="codex-link-grid">
        <StatusDot label="Codex CLI" active={Boolean(status?.codexCliDetected)} />
        <StatusDot
          label="全局捕获脚本"
          active={Boolean(status?.projectHooksInstalled)}
          activeText="已安装"
          inactiveText="未安装"
        />
        <StatusDot
          label="全局使用过程"
          active={Boolean(status?.recentEventCount)}
          activeText="已导入"
          inactiveText="未导入"
        />
        <Metric label="最近 Codex 事件" value={status?.recentEventCount ?? 0} />
        <Metric
          label="最近 Codex Session"
          value={status?.latestEventAt ? new Date(status.latestEventAt).toLocaleString() : "暂无"}
        />
      </div>

      {status?.capabilityAnalysis ? (
        <div className="capability-grid compact-capability-grid">
          <Metric label="Codex 工具入口" value={status.capabilityAnalysis.inventory.totalSkills} />
          <Metric label="Plugin / Skill 来源" value={status.capabilityAnalysis.inventory.pluginCount} />
          <Metric label="MCP 配置" value={status.capabilityAnalysis.config.mcpServerNames.length} />
          <Metric label="环境就绪度" value={`${status.capabilityAnalysis.readinessScore}/100`} />
        </div>
      ) : null}

      <p className="privacy-note">
        我不会读取 Codex 宠物，也不会复制它。我只观察你是否真的用 Codex 完成交付。
      </p>
      <p className="microcopy">
        工具入口只代表环境可用，不代表你已经掌握。Codex 全局记录只是证据来源；文件变化、成功命令、build/test/commit 和交付闭环才会推动成长。
      </p>

      <div className="codex-link-actions single-action">
        <button
          className="connect-all-button"
          type="button"
          disabled={busy !== null}
          onClick={onConnectAll}
        >
          {busy === "codex-connect-all" ? "正在连接..." : action.label}
          <small>{action.description}</small>
        </button>
      </div>

      <div className="codex-link-foot">
        <span>{message || status?.privacyNotice || "尚未读取 Codex hook 事件。"}</span>
        <span>
          最近有效 Session：
          {latestEffectiveSession?.endTime
            ? new Date(latestEffectiveSession.endTime).toLocaleString()
            : "暂无"}
        </span>
      </div>

      {events.length ? (
        <ol className="event-list">
          {events.slice(0, 5).map((event) => (
            <li key={event.eventId}>
              <strong>{event.hookEventName}</strong>
              <span>{event.toolName || event.commandSummary || event.sessionId || "metadata"}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ToolLibraryDrawer({
  open,
  tab,
  onTabChange,
  onClose,
  snapshot,
  status,
  events,
}: {
  open: boolean;
  tab: ToolLibraryTab;
  onTabChange: (tab: ToolLibraryTab) => void;
  onClose: () => void;
  snapshot: AppSnapshot;
  status: CodexLinkStatus | null;
  events: CodexHookEvent[];
}) {
  const analysis =
    status?.capabilityAnalysis ?? snapshot.petState.codexBaseline?.capabilityAnalysis ?? null;
  const sections = analysis ? buildCapabilitySections(analysis) : [];
  const tabs: Array<{ id: ToolLibraryTab; label: string }> = [
    { id: "skills", label: "Skills" },
    { id: "plugins", label: "Plugins" },
    { id: "mcp", label: "MCP" },
    { id: "events", label: "Hooks Events" },
    { id: "github", label: "GitHub 质量" },
  ];

  if (!open) return null;

  return (
    <div className="tool-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="tool-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Codex 工具库"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tool-drawer-head">
          <div>
            <p className="eyebrow">Codex 工具库</p>
            <h2>工具入口不等于能力</h2>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        <p className="microcopy drawer-copy">
          这里展示本机可观察的 Codex 工具入口。是否真正掌握，只看真实 Session、运行验证和交付闭环。
        </p>

        <nav className="tool-tabs" aria-label="Codex 工具库分类">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => onTabChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "skills" ? (
          <ToolRows
            rows={[
              ...toolRowsFromSection("自定义 Skill", sections.find((s) => s.title === "自定义 Skills")?.items ?? [], snapshot.skills),
              ...toolRowsFromSection("插件 Skill", sections.find((s) => s.title === "插件 Skills")?.items ?? [], snapshot.skills),
              ...toolRowsFromSection("系统 Skill", sections.find((s) => s.title === "系统 Skills")?.items ?? [], snapshot.skills),
            ]}
          />
        ) : null}

        {tab === "plugins" ? (
          <ToolRows
            rows={toolRowsFromSection(
              "Plugin",
              sections.find((section) => section.title === "Plugin / Skill 来源")?.items ?? [],
              snapshot.skills,
            )}
          />
        ) : null}

        {tab === "mcp" ? (
          <ToolRows
            rows={toolRowsFromSection(
              "MCP",
              sections.find((section) => section.title === "MCP 配置")?.items ?? [],
              snapshot.skills,
            )}
          />
        ) : null}

        {tab === "events" ? (
          <div className="drawer-list">
            {events.length ? (
              events.slice(0, 30).map((event) => (
                <div key={event.eventId} className="drawer-row">
                  <span>{event.hookEventName}</span>
                  <strong>{event.toolName || event.commandSummary || event.sessionId || "metadata"}</strong>
                  <small>
                    {event.timestamp ? new Date(event.timestamp).toLocaleString() : "暂无时间"} ·{" "}
                    {event.success === undefined ? "元数据" : event.success ? "成功" : "失败"}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">暂无 hook 事件。连接 Codex Hooks 后，事件会写入本机 JSONL。</p>
            )}
          </div>
        ) : null}

        {tab === "github" ? (
          <div className="drawer-list">
            {snapshot.skills.length ? (
              snapshot.skills.map((skill) => (
                <div key={skill.skillId} className="drawer-row">
                  <span>{skill.name}</span>
                  <strong>{skill.qualityScore ?? "未评估"}</strong>
                  <small>
                    Stars {skill.qualityEvidence.stars} · Forks {skill.qualityEvidence.forks} ·{" "}
                    License {skill.qualityEvidence.hasLicense ? "有" : "未检测"}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">暂无 GitHub 质量评估。质量分只代表工具可信度，不影响宠物阶段。</p>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ToolRows({
  rows,
}: {
  rows: Array<{
    name: string;
    source: string;
    enabled: boolean;
    used: boolean;
    deliveredCount: number;
    breakthroughCount: number;
    qualityScore: string | number;
    lastUsedAt: string;
  }>;
}) {
  if (!rows.length) {
    return <p className="muted drawer-empty">暂无可展示工具入口。</p>;
  }

  return (
    <div className="tool-table">
      <div className="tool-table-head">
        <span>名称</span>
        <span>来源</span>
        <span>启用</span>
        <span>真实使用</span>
        <span>交付</span>
        <span>突破</span>
        <span>质量</span>
        <span>最近使用</span>
      </div>
      {rows.map((row) => (
        <div className="tool-table-row" key={`${row.source}-${row.name}`}>
          <strong>{row.name}</strong>
          <span>{row.source}</span>
          <span>{row.enabled ? "是" : "否"}</span>
          <span>{row.used ? "是" : "否"}</span>
          <span>{row.deliveredCount}</span>
          <span>{row.breakthroughCount}</span>
          <span>{row.qualityScore}</span>
          <span>{row.lastUsedAt}</span>
        </div>
      ))}
    </div>
  );
}

function toolRowsFromSection(
  source: string,
  names: string[],
  skills: SkillRecord[],
) {
  return names.map((name) => {
    const skill = findSkillByName(skills, name);
    return {
      name,
      source,
      enabled: true,
      used: Boolean(skill && (skill.usageScore > 0 || skill.deliveredCount > 0)),
      deliveredCount: skill?.deliveredCount ?? 0,
      breakthroughCount: skill?.breakthroughCount ?? 0,
      qualityScore: skill?.qualityScore ?? "未评估",
      lastUsedAt: skill?.lastUsedAt ? new Date(skill.lastUsedAt).toLocaleString() : "暂无",
    };
  });
}

function findSkillByName(skills: SkillRecord[], name: string): SkillRecord | undefined {
  const normalized = name.toLowerCase();
  return skills.find(
    (skill) =>
      skill.name.toLowerCase() === normalized ||
      skill.skillId.toLowerCase() === normalized ||
      normalized.includes(skill.skillId.toLowerCase()),
  );
}

function StatusDot({
  label,
  active,
  activeText = "已检测",
  inactiveText = "未检测",
}: {
  label: string;
  active: boolean;
  activeText?: string;
  inactiveText?: string;
}) {
  return (
    <div className="status-dot-row">
      <span className={active ? "dot active" : "dot"} />
      <div>
        <small>{label}</small>
        <strong>{active ? activeText : inactiveText}</strong>
      </div>
    </div>
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
      <h2>最近 Session 时间线</h2>
      {completed.length ? (
        <ol className="timeline">
          {completed.map((session) => (
            <li key={session.sessionId}>
              <strong>{statusLabel(session.status)}</strong>
              <span>{new Date(session.endTime as string).toLocaleString()}</span>
              <p>{session.feedback}</p>
              <small>
                文件 {session.changedFilesCount} · 成功命令 {session.successfulCommands} · 分数 +{session.score}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">还没有完成的 Codex Session。</p>
      )}
    </section>
  );
}

function UsedToolsList({ snapshot }: { snapshot: AppSnapshot }) {
  const usedSkills = snapshot.skills
    .filter(
      (skill) =>
        skill.usageScore > 0 ||
        skill.deliveredCount > 0 ||
        skill.breakthroughCount > 0,
    )
    .slice(0, 5);

  return (
    <section className="info-panel">
      <h2>真实使用过的工具</h2>
      {usedSkills.length ? (
        <ul className="skill-list">
          {usedSkills.map((skill) => (
            <li key={skill.skillId}>
              <div>
                <span>{skill.name}</span>
                <small>
                  真实使用 {skill.usageScore} · 交付 {skill.deliveredCount} · 突破{" "}
                  {skill.breakthroughCount}
                </small>
              </div>
              <strong>Lv.{skill.level}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">检测到工具入口，但还没有真实使用证据。</p>
      )}
      <p className="microcopy">工具质量不等于你的能力。只有它帮你完成交付，才算成长。</p>
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

  return (
    <div className="report-summary-card">
      <strong>{label}</strong>
      <div className="report-grid">
        <Metric label="有效" value={report.effectiveSessions} />
        <Metric label="交付" value={report.deliveredSessions} />
        <Metric label="突破" value={report.breakthroughSessions} />
        <Metric label="验证率" value={`${report.buildSuccessRate}%`} />
      </div>
      <p>{report.summary}</p>
    </div>
  );
}

function ScoreEvidenceCard({ snapshot }: { snapshot: AppSnapshot }) {
  const completed = snapshot.sessions.filter((session) => session.endTime);
  const effective = completed.filter((session) =>
    ["working", "delivered", "breakthrough"].includes(session.status),
  );
  const delivered = completed.filter((session) =>
    ["delivered", "breakthrough"].includes(session.status),
  );
  const breakthrough = completed.filter((session) => session.status === "breakthrough");
  const inactive = completed.filter((session) => session.status === "inactive");
  const verified = completed.filter((session) => session.buildSuccess || session.testSuccess);
  const promptAverage = completed.length
    ? Math.round(
        completed.reduce((sum, session) => sum + session.promptClarityScore, 0) /
          completed.length,
      )
    : 0;
  const skillUsageCount = snapshot.skills.filter((skill) => skill.usageScore > 0).length;

  return (
    <section className="info-panel evidence-panel">
      <h2>评分依据</h2>
      <div className="evidence-grid">
        <Metric label="有效 Session" value={effective.length} />
        <Metric label="Delivered" value={delivered.length} />
        <Metric label="Breakthrough" value={breakthrough.length} />
        <Metric label="无效 Session" value={inactive.length} />
        <Metric
          label="Build/Test 成功率"
          value={completed.length ? `${Math.round((verified.length / completed.length) * 100)}%` : "暂无"}
        />
        <Metric label="Prompt 清晰度" value={completed.length ? promptAverage : "暂无"} />
        <Metric label="Skill 真实使用" value={skillUsageCount} />
      </div>
      <p className="microcopy">Codex 基础分 ≠ 成长分。工具质量只作参考，不会直接推进宠物阶段。</p>
    </section>
  );
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

function petFeedbackLine(
  snapshot: AppSnapshot,
  latestSession: CodexSessionRecord | undefined,
  status: CodexLinkStatus | null,
): string {
  if (latestSession?.status === "breakthrough") {
    return "这次真的学会了一个新动作。";
  }
  if (latestSession?.status === "delivered") {
    return "这次有证据，但我只给一点净化。";
  }
  if (latestSession?.status === "unverified") {
    return "Codex 改了东西，但你还没跑 build/test。";
  }
  if (latestSession?.status === "inactive") {
    return "你和 Codex 聊了，但项目还没动。";
  }
  if (status?.projectHooksInstalled) {
    return "我现在能听到 Codex 的动静了，但交付了我才会变强。";
  }
  const toolCount =
    snapshot.petState.codexBaseline?.capabilityAnalysis?.inventory.totalSkills ??
    snapshot.petState.codexBaseline?.customSkillCount ??
    0;
  if (!snapshot.sessions.some((session) => session.endTime) && toolCount > 10) {
    return "工具库很大，但还没有变成你的能力。";
  }
  return latestSession?.feedback ?? "你有 Codex 基础，但我还没看到真实交付。";
}

function todaySuggestion(snapshot: AppSnapshot, status: CodexLinkStatus | null): string {
  if (snapshot.activeSession) return "结束前至少跑一次 build 或 test，别只停在改文件。";
  if (!status?.projectHooksInstalled && !status?.recentEventCount) {
    return "一键连接全部 Codex 使用过程，让小搓灵先看到真实记录。";
  }
  const latestSession = snapshot.sessions.find((session) => session.endTime);
  if (!latestSession) return "继续用 Codex 做真实改动，并留下 build/test/commit 证据。";
  if (latestSession.status === "unverified") return "补跑 npm run build 或 npm test，把修改变成交付证据。";
  if (latestSession.status === "inactive") return "让 Codex 修改一个真实文件，再运行验证命令。";
  return "继续保持小范围目标，结束前留下验证或 commit。";
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

function feedbackForCodexEvidence(
  latestEvent: CodexHookEvent | undefined,
  evidence: CodexEventEvidence,
): string {
  if (evidence.buildSuccess || evidence.testSuccess) {
    return "这次不是空转，我可以亮一点。";
  }
  if (latestEvent?.commandSummary.includes("build")) {
    return "Codex 跑了 build，我在看结果。";
  }
  if (latestEvent?.hookEventName === "SessionStart") {
    return "我听到 Codex 开工了，但先别急，交付了我才会变强。";
  }
  if (evidence.stopSeen && !evidence.hadFileEditTool) {
    return "Codex 下班了，但项目没动，我不加分。";
  }
  if (evidence.userPromptSubmitted && !evidence.successfulCommands) {
    return "你和 Codex 聊了，但我还没看到成果。";
  }
  return "暂无可评分的 Codex hook 证据。";
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
