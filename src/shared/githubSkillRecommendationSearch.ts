import type {
  GithubSkillRecommendation,
  GithubSkillRecommendationSnapshot,
} from "./types";

export const githubSkillMinStars = 1000;
export const githubSkillQueries = [
  `"codex skills" in:name,description stars:>${githubSkillMinStars}`,
  `topic:codex topic:skill stars:>${githubSkillMinStars}`,
];
export const githubSkillJoinedQuery = githubSkillQueries.join(" | ");

export const defaultGithubSkillRecommendationSnapshot: GithubSkillRecommendationSnapshot = {
  fetchedAt: null,
  source: "github-api",
  query: githubSkillJoinedQuery,
  minStars: githubSkillMinStars,
  recommendations: [],
  error: null,
};

type FetchImpl = typeof fetch;

interface GithubRepoSearchItem {
  full_name?: unknown;
  html_url?: unknown;
  description?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
  open_issues_count?: unknown;
  pushed_at?: unknown;
  created_at?: unknown;
  language?: unknown;
  topics?: unknown;
}

export async function buildGithubSkillRecommendations(input: {
  previous: GithubSkillRecommendationSnapshot;
  now?: Date;
  fetchImpl?: FetchImpl;
}): Promise<GithubSkillRecommendationSnapshot> {
  const now = input.now ?? new Date();
  const fetchedAt = now.toISOString();
  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const candidates = new Map<string, GithubRepoSearchItem>();
    for (const query of githubSkillQueries) {
      const url =
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}` +
        "&sort=stars&order=desc&per_page=10";
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "xiaocuoling-local",
        },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(`GitHub API ${response.status}: ${trimMessage(message)}`);
      }
      const payload = (await response.json()) as { items?: GithubRepoSearchItem[] };
      for (const item of payload.items ?? []) {
        const fullName = asString(item.full_name);
        if (!fullName) continue;
        candidates.set(fullName, item);
      }
    }

    const previousByName = new Map(
      input.previous.recommendations.map((item) => [item.fullName, item]),
    );
    const recommendations = [...candidates.values()]
      .map((item) => toRecommendation(item, previousByName, fetchedAt))
      .filter((item): item is GithubSkillRecommendation => Boolean(item))
      .sort((a, b) => {
        const growthA = a.starGainSinceLastScan ?? -1;
        const growthB = b.starGainSinceLastScan ?? -1;
        if (growthA !== growthB) return growthB - growthA;
        return b.stars - a.stars;
      })
      .slice(0, 6);

    return {
      fetchedAt,
      source: "github-api",
      query: githubSkillJoinedQuery,
      minStars: githubSkillMinStars,
      recommendations,
      error: null,
    };
  } catch (caught) {
    return {
      ...defaultGithubSkillRecommendationSnapshot,
      fetchedAt,
      error: caught instanceof Error ? caught.message : String(caught),
    };
  }
}

function toRecommendation(
  item: GithubRepoSearchItem,
  previousByName: Map<string, GithubSkillRecommendation>,
  retrievedAt: string,
): GithubSkillRecommendation | null {
  const fullName = asString(item.full_name);
  const htmlUrl = asString(item.html_url);
  const stars = asNumber(item.stargazers_count);
  if (!fullName || !htmlUrl || stars < githubSkillMinStars) return null;

  const previous = previousByName.get(fullName);
  const previousStars = previous ? previous.stars : null;
  const starGainSinceLastScan = previousStars === null ? null : stars - previousStars;

  return {
    fullName,
    htmlUrl,
    description: asString(item.description),
    stars,
    forks: asNumber(item.forks_count),
    openIssues: asNumber(item.open_issues_count),
    pushedAt: asString(item.pushed_at),
    createdAt: asString(item.created_at),
    language: asString(item.language),
    topics: Array.isArray(item.topics) ? item.topics.map(asString).filter(Boolean) : [],
    retrievedAt,
    previousStars,
    starGainSinceLastScan,
    recommendationReason:
      starGainSinceLastScan === null
        ? `当前 ${stars} stars，首次记录，暂无增长基线。`
        : `当前 ${stars} stars，比上次读取增加 ${starGainSinceLastScan} stars。`,
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function trimMessage(message: string): string {
  return message.replace(/\s+/g, " ").slice(0, 240);
}
