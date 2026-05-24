import { describe, expect, it } from "vitest";
import {
  buildGithubSkillRecommendations,
  defaultGithubSkillRecommendationSnapshot,
} from "../src/main/githubSkillRecommendations";

describe("GitHub skill recommendations", () => {
  it("uses GitHub API data and calculates growth only from a previous local snapshot", async () => {
    const previous = {
      ...defaultGithubSkillRecommendationSnapshot,
      fetchedAt: "2026-05-23T00:00:00.000Z",
      recommendations: [
        {
          fullName: "owner/codex-skill",
          htmlUrl: "https://github.com/owner/codex-skill",
          description: "Codex skill",
          stars: 1000,
          forks: 20,
          openIssues: 3,
          pushedAt: "2026-05-20T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
          language: "TypeScript",
          topics: ["codex", "skill"],
          retrievedAt: "2026-05-23T00:00:00.000Z",
          previousStars: null,
          starGainSinceLastScan: null,
          recommendationReason: "首次记录，暂无增长基线。",
        },
      ],
    };

    const snapshot = await buildGithubSkillRecommendations({
      previous,
      now: new Date("2026-05-24T00:00:00.000Z"),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                full_name: "owner/codex-skill",
                html_url: "https://github.com/owner/codex-skill",
                description: "A real Codex skill repo",
                stargazers_count: 1042,
                forks_count: 21,
                open_issues_count: 4,
                pushed_at: "2026-05-24T00:00:00Z",
                created_at: "2026-01-01T00:00:00Z",
                language: "TypeScript",
                topics: ["codex", "skill"],
              },
            ],
          }),
          { status: 200 },
        ),
    });

    expect(snapshot.error).toBeNull();
    expect(snapshot.recommendations[0].stars).toBe(1042);
    expect(snapshot.recommendations[0].previousStars).toBe(1000);
    expect(snapshot.recommendations[0].starGainSinceLastScan).toBe(42);
    expect(snapshot.recommendations[0].recommendationReason).toContain("增加 42 stars");
  });

  it("does not invent growth on the first scan", async () => {
    const snapshot = await buildGithubSkillRecommendations({
      previous: defaultGithubSkillRecommendationSnapshot,
      now: new Date("2026-05-24T00:00:00.000Z"),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                full_name: "owner/new-skill",
                html_url: "https://github.com/owner/new-skill",
                description: "Codex skill",
                stargazers_count: 1200,
                forks_count: 30,
                open_issues_count: 2,
                pushed_at: "2026-05-24T00:00:00Z",
                created_at: "2026-05-01T00:00:00Z",
                language: "Markdown",
                topics: ["codex-skill"],
              },
            ],
          }),
          { status: 200 },
        ),
    });

    expect(snapshot.recommendations[0].previousStars).toBeNull();
    expect(snapshot.recommendations[0].starGainSinceLastScan).toBeNull();
    expect(snapshot.recommendations[0].recommendationReason).toContain("首次记录");
  });

  it("returns a real error state instead of fallback recommendations", async () => {
    const snapshot = await buildGithubSkillRecommendations({
      previous: defaultGithubSkillRecommendationSnapshot,
      now: new Date("2026-05-24T00:00:00.000Z"),
      fetchImpl: async () =>
        new Response(JSON.stringify({ message: "rate limit" }), { status: 403 }),
    });

    expect(snapshot.recommendations).toEqual([]);
    expect(snapshot.error).toContain("GitHub API 403");
  });
});
