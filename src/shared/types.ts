export type PetStage =
  | "egg"
  | "chaos"
  | "apprentice"
  | "maker"
  | "mage"
  | "creator";

export type SessionStatus =
  | "inactive"
  | "unverified"
  | "working"
  | "delivered"
  | "breakthrough";

export type Trend = "up" | "flat" | "down";
export type GrowthArchetype =
  | "builder"
  | "debugger"
  | "prompt_master"
  | "explorer"
  | "shipper"
  | "balanced";

export type SkillSource = "local" | "github" | "unknown";

export interface ProjectRecord {
  projectId: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt: string;
}

export interface FileMeta {
  path: string;
  type: string;
  size: number;
  mtimeMs: number;
}

export interface FileChangeSummary {
  changedFilesCount: number;
  addedFilesCount: number;
  deletedFilesCount: number;
  modifiedFilesCount: number;
}

export interface CommandRecord {
  command: string;
  startTime: string;
  endTime: string;
  exitCode: number | null;
  success: boolean;
  outputSummary: string;
}

export interface SkillDetection {
  skillId: string;
  name: string;
  evidence: string[];
}

export interface SkillRecord {
  skillId: string;
  name: string;
  source: SkillSource;
  githubRepo: string;
  firstDetectedAt: string;
  lastUsedAt: string | null;
  detectedCount: number;
  deliveredCount: number;
  breakthroughCount: number;
  qualityScore: number | null;
  usageScore: number;
  sourceSessionId: string;
  sourceProjectId: string;
  evidence: string[];
  qualityEvidence: SkillQualityEvidence;
  level: number;
}

export interface SkillQualityEvidence {
  stars: number;
  forks: number;
  openIssues: number;
  lastPushedAt: string | null;
  hasReadme: boolean;
  hasExamples: boolean;
  hasLicense: boolean;
  repoAgeDays: number;
}

export interface CodexSessionRecord {
  sessionId: string;
  projectId: string;
  projectPath: string;
  taskGoal: string;
  startTime: string;
  endTime: string | null;
  duration: number;
  beforeCommitHash: string;
  beforeGitStatus: string;
  beforePackageJsonDependencies: string[];
  beforeFileSnapshot: Record<string, FileMeta>;
  afterCommitHash: string;
  afterGitStatus: string;
  afterPackageJsonDependencies: string[];
  afterFileSnapshot: Record<string, FileMeta>;
  changedFilesCount: number;
  addedFilesCount: number;
  deletedFilesCount: number;
  modifiedFilesCount: number;
  newDependencies: string[];
  detectedSkills: string[];
  commandsRun: CommandRecord[];
  successfulCommands: number;
  failedCommands: number;
  buildSuccess: boolean;
  testSuccess: boolean;
  gitCommitCreated: boolean;
  status: SessionStatus;
  score: number;
  promptClarityScore: number;
  feedback: string;
}

export interface PetState {
  stage: PetStage;
  baselineStage: PetStage;
  archetype: GrowthArchetype;
  exp: number;
  purificationScore: number;
  aiCapabilityScore: number;
  currentMood: string;
  unlockedItems: string[];
  lastActiveDate: string;
  codexBaseline: CodexBaseline | null;
}

export interface CodexBaseline {
  capturedAt: string;
  codexHome: string;
  codexHomePresent: boolean;
  configPresent: boolean;
  capabilityAnalysis?: CodexCapabilityAnalysis;
  customSkillCount: number;
  pluginSkillCount: number;
  bundledSkillCount: number;
  sampledSkillNames: string[];
  aiCapabilityScore: number;
  purificationFloor: number;
  expFloor: number;
  summary: string;
}

export interface CodexConfigSignals {
  hasModel: boolean;
  hasApprovalPolicy: boolean;
  hasSandboxMode: boolean;
  hasMcpServers: boolean;
  hasHooksReference: boolean;
  mcpServerNames: string[];
}

export interface CodexCapabilityAnalysis {
  capturedAt: string;
  codexHome: string;
  codexCliDetected: boolean;
  codexVersion: string;
  codexHomePresent: boolean;
  configPresent: boolean;
  agentsPresent: boolean;
  projectHookReady: boolean;
  projectPath: string;
  inventory: {
    totalSkills: number;
    customSkillCount: number;
    bundledSkillCount: number;
    pluginSkillCount: number;
    pluginCount: number;
    customSkillNames: string[];
    bundledSkillNames: string[];
    pluginSkillNames: string[];
    pluginNames: string[];
  };
  config: CodexConfigSignals;
  recentHooks: {
    eventCount: number;
    sessionStarts: number;
    toolUses: number;
    buildRuns: number;
    testRuns: number;
    gitCommands: number;
    latestEventAt: string | null;
  };
  privacy: {
    promptContentStored: false;
    codeContentStored: false;
    terminalOutputStored: false;
    uploadsData: false;
  };
  readinessScore: number;
  summary: string;
}

export interface WeeklyReport {
  reportId: string;
  period?: "daily" | "weekly";
  startDate: string;
  endDate: string;
  aiCapabilityScore: number;
  trend: Trend;
  effectiveSessions: number;
  inactiveSessions: number;
  deliveredSessions: number;
  breakthroughSessions: number;
  newSkills: number;
  buildSuccessRate: number;
  promptClarityAverage: number;
  summary: string;
}

export type CodexHookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "Unknown";

export interface CodexHookEvent {
  eventId: string;
  timestamp: string;
  hookEventName: CodexHookEventName;
  sessionId: string;
  cwd: string;
  model: string;
  permissionMode: string;
  source?: string;
  toolName: string;
  commandSummary: string;
  toolUseId: string;
  turnId: string;
  promptLength?: number;
  hasScopeWords?: boolean;
  hasAcceptanceCriteria?: boolean;
  promptClaritySignals?: {
    hasOnlyModify: boolean;
    hasDoNot: boolean;
    hasPreserve: boolean;
    hasAcceptance: boolean;
    hasBuild: boolean;
    hasTest: boolean;
  };
  exitCode?: number | null;
  success?: boolean;
  outputSummary?: string;
  isEditIntent?: boolean;
  isBuildCommand?: boolean;
  isTestCommand?: boolean;
  isGitCommand?: boolean;
  isBuildSuccess?: boolean;
  isTestSuccess?: boolean;
  isGitSuccess?: boolean;
  hasAssistantMessage?: boolean;
  stopHookActive?: boolean;
  transcriptPathExists?: boolean;
}

export interface CodexEventEvidence {
  sessionStarted: boolean;
  userPromptSubmitted: boolean;
  hadFileEditTool: boolean;
  successfulCommands: number;
  failedCommands: number;
  buildSuccess: boolean;
  testSuccess: boolean;
  gitCommandSeen: boolean;
  stopSeen: boolean;
  shouldIncreasePurificationDirectly: false;
}

export interface CodexLinkStatus {
  codexCliDetected: boolean;
  codexVersion: string;
  configPath: string;
  configExists: boolean;
  projectHooksCanInstall: boolean;
  projectHooksInstalled: boolean;
  projectHookPath: string;
  recentEventCount: number;
  latestEventAt: string | null;
  latestSessionId: string;
  connectionMode: "manual" | "hooks";
  privacyNotice: string;
  capabilityAnalysis?: CodexCapabilityAnalysis | null;
}

export interface AppSnapshot {
  projects: ProjectRecord[];
  sessions: CodexSessionRecord[];
  skills: SkillRecord[];
  petState: PetState;
  weeklyReports: WeeklyReport[];
  activeSession: CodexSessionRecord | null;
  codexLink: CodexLinkStatus | null;
}
