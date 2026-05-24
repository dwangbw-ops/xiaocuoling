import type { GithubSkillRecommendationSnapshot } from "./types";

export const emptyGithubSkillRecommendations: GithubSkillRecommendationSnapshot = {
  fetchedAt: null,
  source: "github-api",
  query: "",
  minStars: 1000,
  recommendations: [],
  error: null,
};

export function normalizeGithubSkillRecommendations(
  snapshot: GithubSkillRecommendationSnapshot | null | undefined,
): GithubSkillRecommendationSnapshot {
  return {
    ...emptyGithubSkillRecommendations,
    ...(snapshot ?? {}),
    recommendations: Array.isArray(snapshot?.recommendations)
      ? snapshot.recommendations
      : [],
    error: typeof snapshot?.error === "string" ? snapshot.error : null,
  };
}
