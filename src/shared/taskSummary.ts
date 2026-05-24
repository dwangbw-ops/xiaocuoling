const metadataOnlyGoal = "Codex 全局历史使用过程（仅保存元数据，不保存完整 prompt）";

const stopClausePattern =
  /(不要|别|无需|不需要|不能|不允许|do not|don't|without)\s*[^，。,.；;\n]*/gi;

export function isMetadataOnlyGoal(value: string): boolean {
  return value.trim() === metadataOnlyGoal;
}

export function summarizeTaskTheme(value: string, fallback = ""): string {
  const clean = normalizeTaskText(value);
  if (!clean || isMetadataOnlyGoal(clean)) return normalizeFallback(fallback);

  const candidates = [
    matchFirst(clean, /只\s*(?:修改|改|做|保留)\s*([^，。,.；;\n]+?)(?=，|。|,|；|;|\n|$)/i),
    matchFirst(clean, /(?:做|开发|实现|搭建|新增|创建)\s*(?:一个|这个|这种|一款)?\s*([^，。,.；;\n]+?)(?=，|。|,|；|;|\n|$)/i),
    matchFirst(clean, /把\s*([^，。,.；;\n]+?)\s*(?:改成|做成|调整成|重构为)\s*([^，。,.；;\n]+)/i),
  ];

  for (const candidate of candidates) {
    const summary = cleanupCandidate(candidate);
    if (summary) return summary;
  }

  const firstClause = cleanupCandidate(clean.split(/[，。,.；;\n]/)[0] ?? "");
  return firstClause || normalizeFallback(fallback);
}

export function normalizeTaskText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(stopClausePattern, " ")
    .replace(/\b(?:npm|pnpm|yarn|git)\s+[^\u3002\uff0c,;；\n]*/gi, " ")
    .replace(/\b(?:document|documents|skill|readme|package\.json|tsconfig)\b/gi, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function normalizeFallback(value: string): string {
  const clean = cleanupCandidate(value);
  return clean && !isMetadataOnlyGoal(clean) ? clean : "";
}

function matchFirst(value: string, pattern: RegExp): string {
  const match = pattern.exec(value);
  if (!match) return "";
  return [match[1], match[2]].filter(Boolean).join("");
}

function cleanupCandidate(value: string): string {
  return value
    .replace(/^(?:一个|这个|这种|本次|这次|当前|我的|我这个)\s*/i, "")
    .replace(/^(?:content|AI|Codex)\s*$/i, "")
    .replace(/^(?:针对|进行|完成|处理)\s*/i, "")
    .replace(/\s*(?:进行整改|整改|优化|修复|改造|补齐|调整|重排|重构)\s*$/i, "")
    .replace(/\b(?:document|documents|skill|readme|npm|git)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[：:，。,.；;\s]+$/g, "")
    .trim()
    .slice(0, 80);
}
