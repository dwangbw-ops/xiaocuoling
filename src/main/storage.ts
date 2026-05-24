import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  CodexSessionRecord,
  GithubSkillRecommendationSnapshot,
  GrowthArchetype,
  PetState,
  ProjectRecord,
  SkillRecord,
  WeeklyReport,
} from "../shared/types";
import { stageForPurification } from "../shared/rules";
import { defaultGithubSkillRecommendationSnapshot } from "./githubSkillRecommendations";

interface StoreShape {
  projects: ProjectRecord[];
  codex_sessions: CodexSessionRecord[];
  skills: SkillRecord[];
  pet_state: PetState;
  weekly_reports: WeeklyReport[];
  github_skill_recommendations: GithubSkillRecommendationSnapshot;
}

const defaultPetState: PetState = {
  stage: "egg",
  baselineStage: "egg",
  archetype: "balanced",
  exp: 0,
  purificationScore: 0,
  aiCapabilityScore: 0,
  currentMood: "别看我，我还没准备好。",
  unlockedItems: [],
  lastActiveDate: new Date(0).toISOString(),
  codexBaseline: null,
};

export class JsonStore {
  private readonly rootDir: string;
  private readonly files: Record<keyof StoreShape, string>;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    mkdirSync(this.rootDir, { recursive: true });
    this.files = {
      projects: path.join(this.rootDir, "projects.json"),
      codex_sessions: path.join(this.rootDir, "codex_sessions.json"),
      skills: path.join(this.rootDir, "skills.json"),
      pet_state: path.join(this.rootDir, "pet_state.json"),
      weekly_reports: path.join(this.rootDir, "weekly_reports.json"),
      github_skill_recommendations: path.join(this.rootDir, "github_skill_recommendations.json"),
    };
    this.ensureFiles();
  }

  get dataDir(): string {
    return this.rootDir;
  }

  getProjects(): ProjectRecord[] {
    return this.read("projects");
  }

  saveProjects(projects: ProjectRecord[]) {
    this.write("projects", projects);
  }

  getSessions(): CodexSessionRecord[] {
    return this.read("codex_sessions");
  }

  saveSessions(sessions: CodexSessionRecord[]) {
    this.write("codex_sessions", sessions);
  }

  upsertSession(session: CodexSessionRecord) {
    const sessions = this.getSessions();
    const index = sessions.findIndex((item) => item.sessionId === session.sessionId);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.unshift(session);
    }
    this.saveSessions(sessions);
  }

  getSkills(): SkillRecord[] {
    return this.read("skills").map(normalizeSkillRecord);
  }

  saveSkills(skills: SkillRecord[]) {
    this.write("skills", skills);
  }

  getPetState(): PetState {
    return {
      ...defaultPetState,
      ...this.read("pet_state"),
      baselineStage: normalizeStage(this.read("pet_state").baselineStage),
      archetype: normalizeArchetype(this.read("pet_state").archetype),
    };
  }

  savePetState(petState: PetState) {
    this.write("pet_state", {
      ...petState,
      stage: stageForPurification(petState.purificationScore),
    });
  }

  getWeeklyReports(): WeeklyReport[] {
    return this.read("weekly_reports");
  }

  saveWeeklyReports(reports: WeeklyReport[]) {
    this.write("weekly_reports", reports);
  }

  getGithubSkillRecommendations(): GithubSkillRecommendationSnapshot {
    return {
      ...defaultGithubSkillRecommendationSnapshot,
      ...this.read("github_skill_recommendations"),
    };
  }

  saveGithubSkillRecommendations(snapshot: GithubSkillRecommendationSnapshot) {
    this.write("github_skill_recommendations", snapshot);
  }

  resetAll() {
    this.write("projects", []);
    this.write("codex_sessions", []);
    this.write("skills", []);
    this.write("pet_state", defaultPetState);
    this.write("weekly_reports", []);
    this.write("github_skill_recommendations", defaultGithubSkillRecommendationSnapshot);
  }

  private ensureFiles() {
    this.ensureFile("projects", []);
    this.ensureFile("codex_sessions", []);
    this.ensureFile("skills", []);
    this.ensureFile("pet_state", defaultPetState);
    this.ensureFile("weekly_reports", []);
    this.ensureFile("github_skill_recommendations", defaultGithubSkillRecommendationSnapshot);
  }

  private ensureFile<K extends keyof StoreShape>(key: K, value: StoreShape[K]) {
    try {
      readFileSync(this.files[key], "utf8");
    } catch {
      this.write(key, value);
    }
  }

  private read<K extends keyof StoreShape>(key: K): StoreShape[K] {
    try {
      return JSON.parse(readFileSync(this.files[key], "utf8")) as StoreShape[K];
    } catch {
      this.ensureFiles();
      return JSON.parse(readFileSync(this.files[key], "utf8")) as StoreShape[K];
    }
  }

  private write<K extends keyof StoreShape>(key: K, value: StoreShape[K]) {
    writeFileSync(this.files[key], `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

function normalizeSkillRecord(skill: Partial<SkillRecord> & Pick<SkillRecord, "skillId" | "name">): SkillRecord {
  return {
    skillId: skill.skillId,
    name: skill.name,
    source: skill.source ?? "unknown",
    githubRepo: skill.githubRepo ?? "",
    firstDetectedAt: skill.firstDetectedAt ?? new Date(0).toISOString(),
    lastUsedAt: skill.lastUsedAt ?? null,
    detectedCount: skill.detectedCount ?? 0,
    deliveredCount: skill.deliveredCount ?? 0,
    breakthroughCount: skill.breakthroughCount ?? 0,
    qualityScore: skill.qualityScore ?? null,
    usageScore: skill.usageScore ?? 0,
    sourceSessionId: skill.sourceSessionId ?? "",
    sourceProjectId: skill.sourceProjectId ?? "",
    evidence: skill.evidence ?? [],
    qualityEvidence: {
      stars: 0,
      forks: 0,
      openIssues: 0,
      lastPushedAt: null,
      hasReadme: false,
      hasExamples: false,
      hasLicense: false,
      repoAgeDays: 0,
      ...(skill.qualityEvidence ?? {}),
    },
    level: skill.level ?? 0,
  };
}

function normalizeArchetype(value: GrowthArchetype | undefined): GrowthArchetype {
  return value ?? "balanced";
}

function normalizeStage(value: PetState["stage"] | undefined): PetState["stage"] {
  return value ?? "egg";
}
