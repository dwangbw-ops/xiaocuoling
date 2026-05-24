import { visualStageForPet } from "./petPresentation";
import { buildSessionNarrative } from "./sessionNarrative";
import type { AppSnapshot, GrowthArchetype, PetStage } from "./types";

export const stageLabel: Record<PetStage, string> = {
  egg: "Lv.1 初醒小搓灵",
  chaos: "Lv.2 纸箱小搓灵",
  apprentice: "Lv.3 工具小搓灵",
  maker: "Lv.4 Prompt 小法师",
  mage: "Lv.5 造物小搓灵",
  creator: "Lv.6 高阶造物灵",
};

export const archetypeLabel: Record<GrowthArchetype, string> = {
  builder: "建造型",
  debugger: "修 bug 型",
  prompt_master: "指令型",
  explorer: "探索型",
  shipper: "交付型",
  balanced: "均衡型",
};

export interface ToyGrowthPresentation {
  stage: PetStage;
  level: number;
  stageName: string;
  archetypeName: string;
  feedback: string;
  growthScore: number | "暂无";
  purification: number;
  nextStage: { stage: PetStage; label: string; remaining: number; progress: number } | null;
  recentMemory: { project: string; goal: string; items: string[] } | null;
}

export function buildToyGrowthPresentation(snapshot: AppSnapshot): ToyGrowthPresentation {
  const completedSessions = snapshot.sessions.filter((session) => session.endTime);
  const latestSession = completedSessions[0] ?? null;
  const stage = visualStageForPet(snapshot.petState, snapshot.sessions);
  const hasRealSessions = completedSessions.length > 0;
  const nextStage = nextStageInfo(snapshot.petState.purificationScore);
  const recentMemory = latestSession ? buildRecentMemory(latestSession) : null;

  return {
    stage,
    level: petLevelForStage(stage),
    stageName: stageLabel[stage],
    archetypeName: archetypeLabel[snapshot.petState.archetype],
    feedback:
      latestSession?.feedback ??
      snapshot.petState.currentMood ??
      "你有 Codex 基础，但我还没看到真实交付。",
    growthScore: hasRealSessions ? snapshot.petState.aiCapabilityScore : "暂无",
    purification: Math.round(snapshot.petState.purificationScore),
    nextStage: nextStage
      ? {
          ...nextStage,
          label: stageLabel[nextStage.stage],
        }
      : null,
    recentMemory,
  };
}

export function petLevelForStage(stage: PetStage): number {
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

function buildRecentMemory(session: AppSnapshot["sessions"][number]) {
  const narrative = buildSessionNarrative(session);
  return {
    project: narrative.projectName,
    goal: narrative.goal,
    items: narrative.items,
  };
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
