import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { BrowserWindow, dialog, type OpenDialogOptions } from "electron";
import chokidar, { FSWatcher } from "chokidar";
import { existsSync } from "node:fs";
import { getAllowedCommands, runAllowedCommand } from "./commandRunner";
import { captureCodexBaseline } from "./codexBaseline";
import { CodexLinkAdapter, convertHookEventsToEvidence } from "./adapters/codexLinkAdapter";
import { normalizeObserverSummary } from "./codex/observerSummary";
import {
  diffSnapshots,
  changedSnapshotPaths,
  getGitCommitHash,
  getGitStatus,
  getPackageDependencies,
  isIgnoredPath,
  isUnsafeProjectRoot,
  scanContentSignals,
  takeFileSnapshot,
} from "./projectIntrospection";
import { JsonStore } from "./storage";
import {
  buildWeeklyReport,
  calculateAiCapabilityScore,
  capPurificationGain,
  calculateSessionReward,
  calculateSkillUsageImpact,
  classifySession,
  detectSkillsFromEvidence,
  feedbackForStatus,
  inferGrowthArchetype,
  scorePromptClarity,
  stageForCodexReadiness,
  stageForPurification,
  summarizeWeek,
} from "../shared/rules";
import type {
  AppSnapshot,
  CodexSessionRecord,
  CommandRecord,
  CodexHookEvent,
  CodexLinkStatus,
  PetState,
  ProjectRecord,
  SkillDetection,
  SkillRecord,
  WeeklyReport,
} from "../shared/types";

export class SessionManager {
  private activeSessionId: string | null = null;
  private watcher: FSWatcher | null = null;
  private reportTimer: ReturnType<typeof setInterval> | null = null;
  private readonly watchedEvents: Map<string, string> = new Map();
  private latestWeeklyPurificationBonus = 0;
  private readonly codexLinkAdapter: CodexLinkAdapter;

  constructor(
    private readonly store: JsonStore,
    private readonly broadcast: () => void,
  ) {
    this.codexLinkAdapter = new CodexLinkAdapter(
      process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
      path.join(this.store.dataDir, "codex_hook_events.jsonl"),
    );
    void this.autoCaptureCodexBaseline();
  }

  startReportScheduler() {
    this.stopReportScheduler();
    this.generateDueAbilityReports(new Date());
    this.reportTimer = setInterval(() => {
      if (this.generateDueAbilityReports(new Date())) {
        this.broadcast();
      }
    }, 30 * 60 * 1000);
  }

  stopReportScheduler() {
    if (!this.reportTimer) return;
    clearInterval(this.reportTimer);
    this.reportTimer = null;
  }

  getSnapshot(): AppSnapshot {
    const activeSession = this.getActiveSession();
    const petState = this.reconcilePetState();
    return {
      projects: this.store.getProjects(),
      sessions: this.store.getSessions(),
      skills: this.store.getSkills(),
      petState,
      weeklyReports: this.store.getWeeklyReports(),
      activeSession,
      codexLink: null,
    };
  }

  getCommands(): string[] {
    return getAllowedCommands();
  }

  async selectProject(parentWindow?: BrowserWindow): Promise<AppSnapshot> {
    const options: OpenDialogOptions = {
      properties: ["openDirectory"],
      title: "选择 Codex 本次要修改的项目文件夹",
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) {
      return this.getSnapshot();
    }

    const projectPath = result.filePaths[0];
    const now = new Date().toISOString();
    const projects = this.store.getProjects();
    const existing = projects.find((item) => item.path === projectPath);
    const project: ProjectRecord = existing
      ? { ...existing, lastOpenedAt: now }
      : {
          projectId: createId("project"),
          name: path.basename(projectPath),
          path: projectPath,
          createdAt: now,
          lastOpenedAt: now,
        };

    this.store.saveProjects(
      existing
        ? projects.map((item) => (item.projectId === project.projectId ? project : item))
        : [project, ...projects],
    );
    this.broadcast();
    return this.getSnapshot();
  }

  async startSession(input: {
    projectId: string;
    taskGoal: string;
  }): Promise<AppSnapshot> {
    const projects = this.store.getProjects();
    const project = projects.find((item) => item.projectId === input.projectId);
    if (!project) throw new Error("请先选择项目文件夹。");
    if (this.activeSessionId) throw new Error("已经有一个 Codex Session 正在进行。");
    if (isUnsafeProjectRoot(project.path)) {
      throw new Error("请选择具体项目文件夹，不要选择 Documents、Desktop、Downloads 或用户主目录。");
    }

    const startTime = new Date().toISOString();
    const hookEvents = await this.codexLinkAdapter.readRecentEvents(20);
    const latestHookEvent = hookEvents[0];
    const beforeFileSnapshot = await takeFileSnapshot(project.path);
    const session: CodexSessionRecord = {
      sessionId: createId("session"),
      projectId: project.projectId,
      projectPath: project.path,
      taskGoal: input.taskGoal.trim(),
      startTime,
      endTime: null,
      duration: 0,
      beforeCommitHash: await getGitCommitHash(project.path),
      beforeGitStatus: await getGitStatus(project.path),
      beforePackageJsonDependencies: await getPackageDependencies(project.path),
      beforeFileSnapshot,
      afterCommitHash: "",
      afterGitStatus: "",
      afterPackageJsonDependencies: [],
      afterFileSnapshot: {},
      changedFilesCount: 0,
      addedFilesCount: 0,
      deletedFilesCount: 0,
      modifiedFilesCount: 0,
      newDependencies: [],
      detectedSkills: [],
      commandsRun: [],
      successfulCommands: 0,
      failedCommands: 0,
      buildSuccess: false,
      testSuccess: false,
      gitCommitCreated: false,
      status: "inactive",
      score: 0,
      promptClarityScore: scorePromptClarity(input.taskGoal),
      feedback:
        latestHookEvent?.hookEventName === "SessionStart"
          ? "我听到 Codex 开工了，但先别急，交付了我才会变强。"
          : feedbackForStatus("inactive"),
    };

    this.activeSessionId = session.sessionId;
    this.watchedEvents.clear();
    this.store.upsertSession(session);
    await this.watchProject(project.path);
    this.broadcast();
    return this.getSnapshot();
  }

  async endSession(): Promise<AppSnapshot> {
    const session = this.requireActiveSession();
    const endTime = new Date();
    const hookEvents = await this.getHookEventsForSession(session, endTime);
    const hookEvidence = convertHookEventsToEvidence(hookEvents);
    const hookCommands = commandsFromHookEvents(hookEvents);
    const observerEvidence = await readObserverSummary(
      session.projectPath,
      endTime.toISOString(),
    );
    const afterFileSnapshot = await takeFileSnapshot(session.projectPath);
    const fileDiff = diffSnapshots(session.beforeFileSnapshot, afterFileSnapshot);
    const afterDependencies = await getPackageDependencies(session.projectPath);
    const newDependencies = afterDependencies.filter(
      (dependency) => !session.beforePackageJsonDependencies.includes(dependency),
    );
    const afterCommitHash = await getGitCommitHash(session.projectPath);
    const afterGitStatus = await getGitStatus(session.projectPath);
    const changedPaths = changedSnapshotPaths(
      session.beforeFileSnapshot,
      afterFileSnapshot,
    );
    const contentSignals = await scanContentSignals(session.projectPath, changedPaths);
    const projectSkillDetections = detectSkillsFromEvidence({
      dependencies: newDependencies,
      filePaths: changedPaths,
      contentSignals,
    });
    const allSkillDetections = mergeSkillDetections([
      ...projectSkillDetections,
      ...observerEvidence.detectedSkills,
    ]);
    const existingSkillIds = new Set(this.store.getSkills().map((skill) => skill.skillId));
    const newSkillDetections = allSkillDetections.filter(
      (skill) => !existingSkillIds.has(skill.skillId),
    );
    const commandsRun = [
      ...session.commandsRun,
      ...hookCommands,
      ...observerEvidence.commandsRun,
    ];
    const successfulCommands = commandsRun.filter((command) => command.success).length;
    const failedCommands = commandsRun.filter((command) => !command.success).length;
    const buildSuccess =
      observerEvidence.buildSuccess ||
      hookEvidence.buildSuccess ||
      commandsRun.some(
        (command) => command.command.includes("build") && command.success,
      );
    const testSuccess =
      observerEvidence.testSuccess ||
      hookEvidence.testSuccess ||
      commandsRun.some(
        (command) => /test|vitest|jest/.test(command.command) && command.success,
      );
    const gitCommitCreated =
      (Boolean(session.beforeCommitHash) &&
        Boolean(afterCommitHash) &&
        session.beforeCommitHash !== afterCommitHash) ||
      commandsRun.some((command) => command.command === "git commit" && command.success);
    const status = classifySession({
      changedFilesCount: Math.max(
        fileDiff.changedFilesCount,
        hookEvidence.hadFileEditTool ? 1 : 0,
      ),
      successfulCommands,
      buildSuccess,
      testSuccess,
      gitCommitCreated,
      detectedSkills: newSkillDetections.map((skill) => skill.skillId),
      promptClarityScore: session.promptClarityScore,
    });
    const baseReward = calculateSessionReward({
      status,
      successfulCommands,
      buildSuccess,
      testSuccess,
      gitCommitCreated,
      newSkillCount: newSkillDetections.length,
    });
    const skillReward = this.updateSkills(allSkillDetections, session, status);
    const reward = {
      exp: baseReward.exp + skillReward.exp,
      purification: baseReward.purification + skillReward.purification,
    };
    const updatedSession: CodexSessionRecord = {
      ...session,
      endTime: endTime.toISOString(),
      duration: Math.max(0, endTime.getTime() - new Date(session.startTime).getTime()),
      afterCommitHash,
      afterGitStatus,
      afterPackageJsonDependencies: afterDependencies,
      afterFileSnapshot,
      ...fileDiff,
      newDependencies,
      detectedSkills: allSkillDetections.map((skill) => skill.skillId),
      commandsRun,
      successfulCommands,
      failedCommands,
      buildSuccess,
      testSuccess,
      gitCommitCreated,
      status,
      score: reward.exp,
      feedback: feedbackForHookEvidence(status, hookEvidence, hookEvents),
    };

    this.store.upsertSession(updatedSession);
    this.activeSessionId = null;
    const completed = this.store
      .getSessions()
      .filter((storedSession) => Boolean(storedSession.endTime));
    const aiCapabilityScore = calculateGlobalCapabilityScore(
      completed,
      this.store.getSkills(),
    );
    const weeklyReport = this.refreshWeeklyReport(aiCapabilityScore);
    this.applyPetReward(reward, weeklyReport, aiCapabilityScore);
    this.broadcast();
    return this.getSnapshot();
  }

  async runCommand(command: string): Promise<{ snapshot: AppSnapshot; command: CommandRecord }> {
    const session = this.requireActiveSession();
    const result = await runAllowedCommand(session.projectPath, command);
    this.store.upsertSession({
      ...session,
      commandsRun: [...session.commandsRun, result],
    });
    this.broadcast();
    return { snapshot: this.getSnapshot(), command: result };
  }

  async calibrateFromCodex(projectId?: string): Promise<AppSnapshot> {
    await this.stopWatching();
    const baseline = await captureCodexBaseline({
      eventLogPath: path.join(this.store.dataDir, "codex_hook_events.jsonl"),
      projectPath: this.getProjectPath(projectId),
    });
    this.applyCodexBaseline(baseline);
    this.broadcast();
    return this.getSnapshot();
  }

  private applyCodexBaseline(baseline: Awaited<ReturnType<typeof captureCodexBaseline>>) {
    const petState = this.store.getPetState();
    this.store.savePetState({
      ...petState,
      baselineStage: stageForCodexReadiness(
        baseline.capabilityAnalysis?.readinessScore ?? baseline.aiCapabilityScore,
      ),
      currentMood: baseline.summary,
      unlockedItems: [
        ...new Set([...petState.unlockedItems, ...baseline.sampledSkillNames]),
      ],
      lastActiveDate: new Date().toISOString(),
      codexBaseline: baseline,
    });
  }

  private async autoCaptureCodexBaseline() {
    try {
      const baseline = await captureCodexBaseline({
        eventLogPath: path.join(this.store.dataDir, "codex_hook_events.jsonl"),
        projectPath: null,
      });
      this.applyCodexBaseline(baseline);
      this.broadcast();
    } catch {
      // Auto capture is best-effort and must never block app startup.
    }
  }

  resetData(): AppSnapshot {
    this.activeSessionId = null;
    this.store.resetAll();
    this.broadcast();
    return this.getSnapshot();
  }

  async getCodexLinkStatus(projectId?: string): Promise<CodexLinkStatus> {
    return this.codexLinkAdapter.getStatus(projectId ? this.getProjectPath(projectId) : null);
  }

  async installCodexProjectHooks(projectId: string): Promise<CodexLinkStatus> {
    const projectPath = this.getProjectPath(projectId);
    if (!projectPath) throw new Error("请先选择要启用 hooks 的项目。");
    await this.codexLinkAdapter.installProjectHooks(projectPath);
    return this.getCodexLinkStatus(projectId);
  }

  async connectCodexGlobally(): Promise<{
    snapshot: AppSnapshot;
    status: CodexLinkStatus;
    events: CodexHookEvent[];
  }> {
    await this.stopWatching();
    await this.codexLinkAdapter.installGlobalHooks();
    const events = await this.codexLinkAdapter.readRecentEvents(100_000);
    const imported = this.importCodexHistorySessions(events);
    const baseline = await captureCodexBaseline({
      eventLogPath: path.join(this.store.dataDir, "codex_hook_events.jsonl"),
      projectPath: null,
    });
    this.applyCodexBaseline(baseline);
    const status = await this.codexLinkAdapter.getStatus(null);
    const recentEvents = events.slice(0, 50);
    if (imported.count > 0 || imported.reward.exp > 0 || imported.reward.purification > 0) {
      const completed = this.store
        .getSessions()
        .filter((storedSession) => Boolean(storedSession.endTime));
      const aiCapabilityScore = calculateGlobalCapabilityScore(
        completed,
        this.store.getSkills(),
      );
      const weeklyReport = this.refreshWeeklyReport(aiCapabilityScore);
      this.applyPetReward(imported.reward, weeklyReport, aiCapabilityScore);
    }
    this.broadcast();
    return {
      snapshot: this.getSnapshot(),
      status,
      events: recentEvents,
    };
  }

  async getCodexHookEvents(limit = 20): Promise<{
    events: CodexHookEvent[];
    evidence: ReturnType<typeof convertHookEventsToEvidence>;
  }> {
    const events = await this.codexLinkAdapter.readRecentEvents(limit);
    return {
      events,
      evidence: convertHookEventsToEvidence(events),
    };
  }

  async disconnectCodex(projectId?: string): Promise<CodexLinkStatus> {
    const projectPath = this.getProjectPath(projectId);
    if (projectPath) {
      const hookPath = path.join(projectPath, ".codex", "hooks", "xiaocuoling-capture.js");
      if (existsSync(hookPath)) await rm(hookPath, { force: true });
    }
    await writeFile(path.join(this.store.dataDir, "codex_hook_events.jsonl"), "", "utf8");
    return this.getCodexLinkStatus(projectId);
  }

  private getActiveSession(): CodexSessionRecord | null {
    if (!this.activeSessionId) return null;
    return (
      this.store
        .getSessions()
        .find((session) => session.sessionId === this.activeSessionId) ?? null
    );
  }

  private getProjectPath(projectId?: string): string | null {
    if (!projectId) return this.store.getProjects()[0]?.path ?? null;
    return this.store.getProjects().find((project) => project.projectId === projectId)?.path ?? null;
  }

  private importCodexHistorySessions(events: CodexHookEvent[]): {
    count: number;
    reward: { exp: number; purification: number };
  } {
    const grouped = new Map<string, CodexHookEvent[]>();
    for (const event of events) {
      const key = event.sessionId || event.turnId || event.eventId;
      const list = grouped.get(key) ?? [];
      list.push(event);
      grouped.set(key, list);
    }

    const existingSessionIds = new Set(this.store.getSessions().map((session) => session.sessionId));
    let count = 0;
    const reward = { exp: 0, purification: 0 };

    const groupedEntries = [...grouped.entries()].sort(
      (a, b) => latestEventMs(a[1]) - latestEventMs(b[1]),
    );

    for (const [sourceSessionId, sessionEvents] of groupedEntries) {
      const ordered = [...sessionEvents].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const stableSessionId = `codex_history_${stableHash(sourceSessionId).slice(0, 18)}`;
      if (existingSessionIds.has(stableSessionId)) continue;

      const evidence = convertHookEventsToEvidence(ordered);
      const commandsRun = commandsFromHookEvents(ordered);
      const gitCommitCreated = commandsRun.some(
        (command) => command.command === "git commit" && command.success,
      );
      const changedFilesCount = evidence.hadFileEditTool ? 1 : 0;
      const hasRealBehavior =
        changedFilesCount > 0 ||
        evidence.successfulCommands > 0 ||
        evidence.buildSuccess ||
        evidence.testSuccess ||
        gitCommitCreated;
      if (!hasRealBehavior) continue;

      const status = classifySession({
        changedFilesCount,
        successfulCommands: evidence.successfulCommands,
        buildSuccess: evidence.buildSuccess,
        testSuccess: evidence.testSuccess,
        gitCommitCreated,
        detectedSkills: [],
        promptClarityScore: promptClarityScoreFromEvents(ordered),
      });
      const sessionReward = calculateSessionReward({
        status,
        successfulCommands: evidence.successfulCommands,
        buildSuccess: evidence.buildSuccess,
        testSuccess: evidence.testSuccess,
        gitCommitCreated,
        newSkillCount: 0,
      });
      const startTime = ordered[0]?.timestamp ?? new Date().toISOString();
      const endTime = ordered[ordered.length - 1]?.timestamp ?? startTime;
      const projectPath = ordered.find((event) => event.cwd)?.cwd ?? "";

      const session: CodexSessionRecord = {
        sessionId: stableSessionId,
        projectId: "codex-global-history",
        projectPath,
        taskGoal: "Codex 全局历史使用过程（仅保存元数据，不保存完整 prompt）",
        startTime,
        endTime,
        duration: Math.max(0, new Date(endTime).getTime() - new Date(startTime).getTime()),
        beforeCommitHash: "",
        beforeGitStatus: "",
        beforePackageJsonDependencies: [],
        beforeFileSnapshot: {},
        afterCommitHash: "",
        afterGitStatus: "",
        afterPackageJsonDependencies: [],
        afterFileSnapshot: {},
        changedFilesCount,
        addedFilesCount: 0,
        deletedFilesCount: 0,
        modifiedFilesCount: changedFilesCount,
        newDependencies: [],
        detectedSkills: [],
        commandsRun,
        successfulCommands: evidence.successfulCommands,
        failedCommands: evidence.failedCommands,
        buildSuccess: evidence.buildSuccess,
        testSuccess: evidence.testSuccess,
        gitCommitCreated,
        status,
        score: sessionReward.exp,
        promptClarityScore: promptClarityScoreFromEvents(ordered),
        feedback: feedbackForHookEvidence(status, evidence, ordered),
      };

      this.store.upsertSession(session);
      existingSessionIds.add(stableSessionId);
      reward.exp += sessionReward.exp;
      reward.purification += sessionReward.purification;
      count += 1;
    }

    return { count, reward };
  }

  private async getHookEventsForSession(
    session: CodexSessionRecord,
    endTime: Date,
  ): Promise<CodexHookEvent[]> {
    const startMs = new Date(session.startTime).getTime();
    const endMs = endTime.getTime();
    const events = await this.codexLinkAdapter.readRecentEvents(500);
    return events.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime();
      if (Number.isNaN(eventTime) || eventTime < startMs || eventTime > endMs) {
        return false;
      }
      return !event.cwd || isPathInside(session.projectPath, event.cwd);
    });
  }

  private requireActiveSession(): CodexSessionRecord {
    const session = this.getActiveSession();
    if (!session) throw new Error("当前没有正在进行的 Codex Session。");
    return session;
  }

  private updateSkills(
    detections: SkillDetection[],
    session: CodexSessionRecord,
    status: CodexSessionRecord["status"],
  ): { exp: number; purification: number } {
    const now = new Date().toISOString();
    const existing = this.store.getSkills();
    const updated = [...existing];
    let exp = 0;
    let purification = 0;

    for (const detection of detections) {
      const index = updated.findIndex((skill) => skill.skillId === detection.skillId);
      const impact = calculateSkillUsageImpact(status);
      if (index >= 0) {
        const previous = updated[index];
        const canAddPurification =
          impact.purification > 0 &&
          (!previous.lastUsedAt || isOlderThanHours(previous.lastUsedAt, 24 * 7));
        exp += impact.exp;
        if (canAddPurification) {
          purification += impact.purification;
        }
        const nextUsageScore = previous.usageScore + impact.usageScore;
        updated[index] = {
          ...previous,
          lastUsedAt: now,
          detectedCount: previous.detectedCount + 1,
          deliveredCount:
            previous.deliveredCount +
            (status === "delivered" || status === "breakthrough" ? 1 : 0),
          breakthroughCount:
            previous.breakthroughCount + (status === "breakthrough" ? 1 : 0),
          usageScore: nextUsageScore,
          level: levelForUsageScore(nextUsageScore),
          evidence: [...new Set([...previous.evidence, ...detection.evidence])],
        };
      } else {
        exp += impact.exp;
        if (impact.purification > 0) {
          purification += impact.purification;
        }
        const usageScore = impact.usageScore;
        const record: SkillRecord = {
          skillId: detection.skillId,
          name: detection.name,
          source: "local",
          githubRepo: "",
          firstDetectedAt: now,
          lastUsedAt: now,
          detectedCount: 1,
          deliveredCount: status === "delivered" || status === "breakthrough" ? 1 : 0,
          breakthroughCount: status === "breakthrough" ? 1 : 0,
          qualityScore: null,
          usageScore,
          sourceSessionId: session.sessionId,
          sourceProjectId: session.projectId,
          evidence: detection.evidence,
          qualityEvidence: defaultQualityEvidence(),
          level: levelForUsageScore(usageScore),
        };
        updated.push(record);
      }
    }

    this.store.saveSkills(updated);
    return { exp, purification };
  }

  private refreshWeeklyReport(aiCapabilityScore: number): WeeklyReport {
    const now = new Date();
    const start = startOfDay(addDays(now, -6));
    const end = endOfDay(now);
    const previousStart = startOfDay(addDays(start, -7));
    const previousEnd = endOfDay(addDays(start, -1));
    const completed = this.store
      .getSessions()
      .filter((session) => Boolean(session.endTime));
    const currentSessions = completed
      .filter((session) => isBetween(new Date(session.endTime as string), start, end))
      .map(toWeeklyInput);
    const previousSessions = completed
      .filter((session) =>
        isBetween(new Date(session.endTime as string), previousStart, previousEnd),
      )
      .map(toWeeklyInput);
    const report = buildWeeklyReport({
      period: "weekly",
      startDate: toDateId(start),
      endDate: toDateId(end),
      currentSessions,
      previousSessions,
      aiCapabilityScore,
    });
    this.latestWeeklyPurificationBonus = calculateWeeklyPurificationBonus(
      currentSessions,
      previousSessions,
    );
    const reports = this.store.getWeeklyReports();
    this.store.saveWeeklyReports([
      report,
      ...reports.filter((item) => item.reportId !== report.reportId),
    ]);
    return report;
  }

  private generateDueAbilityReports(now: Date): boolean {
    if (now.getHours() < 21) return false;

    const completed = this.store
      .getSessions()
      .filter((session) => Boolean(session.endTime));
    const aiCapabilityScore = calculateGlobalCapabilityScore(
      completed,
      this.store.getSkills(),
    );
    const reports = this.store.getWeeklyReports();
    const nextReports: WeeklyReport[] = [];

    const dailyReport = this.buildAbilityReport("daily", now, aiCapabilityScore);
    if (!reports.some((report) => report.reportId === dailyReport.reportId)) {
      nextReports.push(dailyReport);
    }

    if (now.getDay() === 0) {
      const weeklyReport = this.buildAbilityReport("weekly", now, aiCapabilityScore);
      if (!reports.some((report) => report.reportId === weeklyReport.reportId)) {
        nextReports.push(weeklyReport);
      }
    }

    if (!nextReports.length) return false;
    this.store.saveWeeklyReports([...nextReports, ...reports]);
    return true;
  }

  private buildAbilityReport(
    period: "daily" | "weekly",
    now: Date,
    aiCapabilityScore: number,
  ): WeeklyReport {
    const completed = this.store
      .getSessions()
      .filter((session) => Boolean(session.endTime));
    const currentStart =
      period === "daily" ? startOfDay(now) : startOfDay(addDays(now, -6));
    const currentEnd = endOfDay(now);
    const previousStart =
      period === "daily" ? startOfDay(addDays(now, -1)) : startOfDay(addDays(now, -13));
    const previousEnd =
      period === "daily" ? endOfDay(addDays(now, -1)) : endOfDay(addDays(now, -7));

    return buildWeeklyReport({
      period,
      startDate: toDateId(currentStart),
      endDate: toDateId(currentEnd),
      currentSessions: completed
        .filter((session) =>
          isBetween(new Date(session.endTime as string), currentStart, currentEnd),
        )
        .map(toWeeklyInput),
      previousSessions: completed
        .filter((session) =>
          isBetween(new Date(session.endTime as string), previousStart, previousEnd),
        )
        .map(toWeeklyInput),
      aiCapabilityScore,
    });
  }

  private applyPetReward(
    reward: { exp: number; purification: number },
    report: WeeklyReport,
    aiCapabilityScore: number,
  ) {
    void report;
    const petState = this.store.getPetState();
    const sessions = this.store
      .getSessions()
      .filter((session) => Boolean(session.endTime));
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfDay(addDays(now, -6));
    const weekEnd = endOfDay(now);
    const earnedTodayWithCurrent = estimatePurificationFromSessions(
      sessions.filter((session) =>
        isBetween(new Date(session.endTime as string), todayStart, todayEnd),
      ),
    );
    const earnedThisWeekWithCurrent = estimatePurificationFromSessions(
      sessions.filter((session) =>
        isBetween(new Date(session.endTime as string), weekStart, weekEnd),
      ),
    );
    const cappedPurification = capPurificationGain({
      requested: reward.purification,
      dailyEarned: Math.max(0, earnedTodayWithCurrent - reward.purification),
      weeklyEarned: Math.max(0, earnedThisWeekWithCurrent - reward.purification),
    });
    const purificationScore =
      petState.purificationScore + cappedPurification;
    const nextState: PetState = {
      ...petState,
      exp: petState.exp + reward.exp,
      purificationScore,
      stage: stageForPurification(purificationScore),
      archetype: inferGrowthArchetype(sessions.slice(0, 20).map(toArchetypeInput)),
      aiCapabilityScore,
      currentMood:
        sessions[0]?.feedback ?? "别看我，我还没准备好。",
      unlockedItems: this.store.getSkills().map((skill) => skill.name),
      lastActiveDate: new Date().toISOString(),
    };
    this.store.savePetState(nextState);
  }

  private async watchProject(projectPath: string) {
    if (isUnsafeProjectRoot(projectPath)) {
      throw new Error("请选择具体项目文件夹，不要选择 Documents、Desktop、Downloads 或用户主目录。");
    }
    await this.stopWatching();
    this.watcher = chokidar.watch(projectPath, {
      ignored: (candidatePath) => {
        const relative = path.relative(projectPath, candidatePath);
        return Boolean(relative) && isIgnoredPath(relative);
      },
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });
    this.watcher.on("all", (eventName, filePath) => {
      const relative = path.relative(projectPath, filePath).replaceAll("\\", "/");
      if (!relative || isIgnoredPath(relative)) return;
      this.watchedEvents.set(relative, eventName);
    });
  }

  private async stopWatching() {
    await this.watcher?.close();
    this.watcher = null;
  }

  private reconcilePetState(): PetState {
    const petState = this.store.getPetState();
    const completed = this.store
      .getSessions()
      .filter((session) => Boolean(session.endTime));
    if (!completed.length) {
      const resetState = {
        ...petState,
        exp: 0,
        purificationScore: 0,
        aiCapabilityScore: 0,
        stage: "egg" as const,
        baselineStage: petState.baselineStage,
        archetype: petState.codexBaseline ? petState.archetype : ("balanced" as const),
      };
      if (
        resetState.exp !== petState.exp ||
        resetState.purificationScore !== petState.purificationScore ||
        resetState.aiCapabilityScore !== petState.aiCapabilityScore ||
        resetState.stage !== petState.stage ||
        resetState.archetype !== petState.archetype
      ) {
        this.store.savePetState(resetState);
      }
      return resetState;
    }
    return petState;
  }
}

function calculateGlobalCapabilityScore(
  sessions: CodexSessionRecord[],
  skills: SkillRecord[],
): number {
  const completed = sessions.filter((session) => Boolean(session.endTime));
  if (!completed.length) return 0;

  const delivered = completed.filter((session) =>
    ["delivered", "breakthrough"].includes(session.status),
  ).length;
  const verified = completed.filter(
    (session) =>
      session.buildSuccess ||
      session.testSuccess ||
      session.gitCommitCreated ||
      session.successfulCommands >= 2,
  ).length;
  const promptClarityScore = Math.round(
    completed.reduce((sum, session) => sum + session.promptClarityScore, 0) /
      completed.length,
  );
  const masteredTools = skills.filter(
    (skill) =>
      skill.deliveredCount >= 2 &&
      Boolean(skill.lastUsedAt) &&
      Date.now() - new Date(skill.lastUsedAt as string).getTime() <= 7 * 86_400_000,
  ).length;

  return calculateAiCapabilityScore({
    deliveryScore: Math.round((delivered / completed.length) * 100),
    verificationScore: Math.round((verified / completed.length) * 100),
    promptClarityScore,
    repairScore: calculateIterationEfficiency(completed),
    masteredToolScore: Math.min(100, masteredTools * 20),
  });
}

function calculateIterationEfficiency(sessions: CodexSessionRecord[]): number {
  let opportunities = 0;
  let recovered = 0;
  const chronological = [...sessions].reverse();

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    const previousBuildFailed = previous.commandsRun.some(
      (command) => command.command === "npm run build" && !command.success,
    );
    const previousTestFailed = previous.commandsRun.some(
      (command) => command.command === "npm test" && !command.success,
    );
    if (previousBuildFailed || previousTestFailed) {
      opportunities += 1;
      if (
        (previousBuildFailed && current.buildSuccess) ||
        (previousTestFailed && current.testSuccess)
      ) {
        recovered += 1;
      }
    }
  }

  if (!opportunities) return 0;
  return Math.round((recovered / opportunities) * 100);
}

function toWeeklyInput(session: CodexSessionRecord) {
  return {
    status: session.status,
    buildSuccess: session.buildSuccess,
    testSuccess: session.testSuccess,
    promptClarityScore: session.promptClarityScore,
    detectedSkills: session.detectedSkills,
  };
}

function calculateWeeklyPurificationBonus(
  currentSessions: ReturnType<typeof toWeeklyInput>[],
  previousSessions: ReturnType<typeof toWeeklyInput>[],
): number {
  const current = summarizeWeek(currentSessions);
  const previous = summarizeWeek(previousSessions);
  const currentInactiveRatio = currentSessions.length
    ? current.inactiveSessions / currentSessions.length
    : 0;
  const previousInactiveRatio = previousSessions.length
    ? previous.inactiveSessions / previousSessions.length
    : 0;
  let bonus = 0;
  if (current.effectiveSessions > previous.effectiveSessions) bonus += 2;
  if (current.deliveredSessions > previous.deliveredSessions) bonus += 3;
  if (current.breakthroughSessions > previous.breakthroughSessions) bonus += 4;
  if (currentInactiveRatio < previousInactiveRatio) bonus += 2;
  if (current.buildSuccessRate > previous.buildSuccessRate) bonus += 2;
  if (current.promptClarityAverage > previous.promptClarityAverage) bonus += 2;
  return Math.min(10, bonus);
}

function toArchetypeInput(session: CodexSessionRecord) {
  return {
    status: session.status,
    buildSuccess: session.buildSuccess,
    testSuccess: session.testSuccess,
    promptClarityScore: session.promptClarityScore,
    detectedSkills: session.detectedSkills,
    addedFilesCount: session.addedFilesCount,
    newDependencies: session.newDependencies,
    gitCommitCreated: session.gitCommitCreated,
    commandsRun: session.commandsRun,
  };
}

function estimatePurificationFromSessions(sessions: CodexSessionRecord[]): number {
  return sessions.reduce((sum, session) => {
    if (session.status === "breakthrough") return sum + 3;
    if (session.status === "delivered") return sum + 1;
    return sum;
  }, 0);
}

function commandsFromHookEvents(events: CodexHookEvent[]): CommandRecord[] {
  const seen = new Set<string>();
  return [...events]
    .reverse()
    .filter((event) => event.commandSummary && typeof event.success === "boolean")
    .filter((event) => {
      const key = event.toolUseId || event.eventId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((event) => ({
      command: event.commandSummary,
      startTime: event.timestamp,
      endTime: event.timestamp,
      exitCode: event.exitCode ?? null,
      success: Boolean(event.success),
      outputSummary: "Codex hook metadata: command summary only, full output not stored.",
    }));
}

function promptClarityScoreFromEvents(events: CodexHookEvent[]): number {
  const promptEvents = events.filter((event) => typeof event.promptLength === "number");
  if (!promptEvents.length) return 0;

  const scores = promptEvents.map((event) => {
    const signals = event.promptClaritySignals;
    let score = Math.min(25, Math.floor((event.promptLength ?? 0) / 5));
    if (event.hasScopeWords) score += 18;
    if (event.hasAcceptanceCriteria) score += 18;
    if (signals?.hasDoNot) score += 13;
    if (signals?.hasPreserve) score += 13;
    if (signals?.hasBuild) score += 8;
    if (signals?.hasTest) score += 8;
    return Math.min(100, Math.max(0, Math.round(score)));
  });

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function latestEventMs(events: CodexHookEvent[]): number {
  return events.reduce((latest, event) => {
    const timestamp = new Date(event.timestamp).getTime();
    return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp);
  }, 0);
}

function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

async function readObserverSummary(
  projectPath: string,
  timestamp: string,
): Promise<ReturnType<typeof normalizeObserverSummary>> {
  const summaryPath = path.join(projectPath, ".xiaocuoling", "session-summary.json");
  if (!existsSync(summaryPath)) return normalizeObserverSummary({}, timestamp);
  try {
    const content = await readFile(summaryPath, "utf8");
    return normalizeObserverSummary(JSON.parse(content), timestamp);
  } catch {
    return normalizeObserverSummary({}, timestamp);
  }
}

function mergeSkillDetections(detections: SkillDetection[]): SkillDetection[] {
  const merged = new Map<string, SkillDetection>();
  for (const detection of detections) {
    const existing = merged.get(detection.skillId);
    if (!existing) {
      merged.set(detection.skillId, detection);
      continue;
    }
    merged.set(detection.skillId, {
      ...existing,
      evidence: [...new Set([...existing.evidence, ...detection.evidence])],
    });
  }
  return [...merged.values()];
}

function feedbackForHookEvidence(
  status: CodexSessionRecord["status"],
  evidence: ReturnType<typeof convertHookEventsToEvidence>,
  events: CodexHookEvent[],
): string {
  if (status === "breakthrough") {
    return "这次真的学会了一个新动作。";
  }
  if (status === "delivered") {
    return "这次有证据，但我只给一点净化。";
  }
  if (events.some((event) => event.commandSummary.includes("build"))) {
    return "Codex 跑了 build，我在看结果。";
  }
  if (status === "inactive" && evidence.stopSeen && !evidence.hadFileEditTool) {
    return "Codex 下班了，但项目没动，我不加分。";
  }
  if (status === "inactive" && evidence.userPromptSubmitted) {
    return "你和 Codex 聊了，但我还没看到成果。";
  }
  if (status === "inactive" && evidence.sessionStarted) {
    return "我听到 Codex 开工了，但先别急，交付了我才会变强。";
  }
  return feedbackForStatus(status);
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function defaultQualityEvidence() {
  return {
    stars: 0,
    forks: 0,
    openIssues: 0,
    lastPushedAt: null,
    hasReadme: false,
    hasExamples: false,
    hasLicense: false,
    repoAgeDays: 0,
  };
}

function levelForUsageScore(usageScore: number): number {
  return Math.floor(usageScore / 50);
}

function isOlderThanHours(isoDate: string, hours: number): boolean {
  return Date.now() - new Date(isoDate).getTime() > hours * 3_600_000;
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isBetween(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function toDateId(date: Date): string {
  return date.toISOString().slice(0, 10);
}
