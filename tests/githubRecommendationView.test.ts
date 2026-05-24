import { describe, expect, it } from "vitest";
import { normalizeGithubSkillRecommendations } from "../src/shared/githubRecommendationView";

describe("GitHub recommendation view state", () => {
  it("keeps old snapshots from crashing the renderer without inventing recommendations", () => {
    const normalized = normalizeGithubSkillRecommendations(undefined);

    expect(normalized.source).toBe("github-api");
    expect(normalized.recommendations).toEqual([]);
    expect(normalized.fetchedAt).toBeNull();
    expect(normalized.error).toBeNull();
  });
});
