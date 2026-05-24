import { describe, expect, it } from "vitest";
import {
  normalizeGithubSkillRecommendations,
  shouldAutoFetchGithubRecommendations,
} from "../src/shared/githubRecommendationView";

describe("GitHub recommendation view state", () => {
  it("keeps old snapshots from crashing the renderer without inventing recommendations", () => {
    const normalized = normalizeGithubSkillRecommendations(undefined);

    expect(normalized.source).toBe("github-api");
    expect(normalized.recommendations).toEqual([]);
    expect(normalized.fetchedAt).toBeNull();
    expect(normalized.error).toBeNull();
  });

  it("auto-fetches only when no real GitHub snapshot has been retrieved yet", () => {
    expect(shouldAutoFetchGithubRecommendations(undefined)).toBe(true);
    expect(
      shouldAutoFetchGithubRecommendations({
        ...normalizeGithubSkillRecommendations(undefined),
        fetchedAt: "2026-05-24T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      shouldAutoFetchGithubRecommendations({
        ...normalizeGithubSkillRecommendations(undefined),
        error: "GitHub API 403",
      }),
    ).toBe(false);
  });
});
