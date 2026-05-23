import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileChangeSummary, FileMeta } from "../shared/types";

const ignoredDirNames = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
]);

const ignoredFileNames = new Set([".DS_Store"]);
const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".icns",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".dmg",
  ".exe",
]);

const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".css",
  ".html",
  ".md",
  ".yml",
  ".yaml",
  ".mjs",
  ".cjs",
]);

export async function getGitCommitHash(projectPath: string): Promise<string> {
  return runGit(projectPath, ["rev-parse", "HEAD"]);
}

export async function getGitStatus(projectPath: string): Promise<string> {
  const output = await runGit(projectPath, ["status", "--short"]);
  return output || "clean";
}

export async function getPackageDependencies(projectPath: string): Promise<string[]> {
  const packagePath = path.join(projectPath, "package.json");
  if (!existsSync(packagePath)) return [];

  try {
    const parsed = JSON.parse(await readFile(packagePath, "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    return [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
      ...Object.keys(parsed.peerDependencies ?? {}),
      ...Object.keys(parsed.optionalDependencies ?? {}),
    ].sort();
  } catch {
    return [];
  }
}

export async function takeFileSnapshot(
  projectPath: string,
): Promise<Record<string, FileMeta>> {
  const snapshot: Record<string, FileMeta> = {};
  await walk(projectPath, projectPath, snapshot);
  return snapshot;
}

export function diffSnapshots(
  before: Record<string, FileMeta>,
  after: Record<string, FileMeta>,
): FileChangeSummary {
  let addedFilesCount = 0;
  let deletedFilesCount = 0;
  let modifiedFilesCount = 0;

  for (const filePath of Object.keys(after)) {
    if (!before[filePath]) {
      addedFilesCount += 1;
      continue;
    }

    if (
      before[filePath].mtimeMs !== after[filePath].mtimeMs ||
      before[filePath].size !== after[filePath].size
    ) {
      modifiedFilesCount += 1;
    }
  }

  for (const filePath of Object.keys(before)) {
    if (!after[filePath]) deletedFilesCount += 1;
  }

  return {
    addedFilesCount,
    deletedFilesCount,
    modifiedFilesCount,
    changedFilesCount: addedFilesCount + deletedFilesCount + modifiedFilesCount,
  };
}

export function changedSnapshotPaths(
  before: Record<string, FileMeta>,
  after: Record<string, FileMeta>,
): string[] {
  const changed = new Set<string>();

  for (const filePath of Object.keys(after)) {
    if (!before[filePath]) {
      changed.add(filePath);
      continue;
    }
    if (
      before[filePath].mtimeMs !== after[filePath].mtimeMs ||
      before[filePath].size !== after[filePath].size
    ) {
      changed.add(filePath);
    }
  }

  for (const filePath of Object.keys(before)) {
    if (!after[filePath]) changed.add(filePath);
  }

  return [...changed].sort();
}

export async function scanContentSignals(
  projectPath: string,
  targetFiles?: string[],
): Promise<string[]> {
  const signals = new Set<string>();
  const files: string[] = [];
  if (targetFiles?.length) {
    files.push(
      ...targetFiles.filter((filePath) =>
        textExtensions.has(path.extname(filePath).toLowerCase()),
      ),
    );
  } else {
    await collectTextFiles(projectPath, projectPath, files);
  }

  for (const relativePath of files.slice(0, 250)) {
    const fullPath = path.join(projectPath, relativePath);
    try {
      const stats = await stat(fullPath);
      if (stats.size > 250_000) continue;
      const content = await readFile(fullPath, "utf8");
      if (content.includes("localStorage")) signals.add("localStorage");
      if (content.includes("fetch(")) signals.add("fetch(");
      if (content.includes("axios")) signals.add("axios");
      if (content.includes("@media")) signals.add("@media");
      if (/\bsm:/.test(content)) signals.add("sm:");
      if (/\bmd:/.test(content)) signals.add("md:");
      if (/\blg:/.test(content)) signals.add("lg:");
      if (/mobile/i.test(content)) signals.add("mobile");
      if (/responsive/i.test(content)) signals.add("responsive");
    } catch {
      continue;
    }
  }

  return [...signals];
}

export function listSnapshotPaths(snapshot: Record<string, FileMeta>): string[] {
  return Object.keys(snapshot).sort();
}

export function isIgnoredPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.some((part) => ignoredDirNames.has(part))) return true;

  const base = path.basename(normalized);
  if (ignoredFileNames.has(base)) return true;
  if (base.endsWith(".log")) return true;
  if (base.endsWith(".tmp") || base.endsWith(".temp") || base.endsWith(".swp")) return true;
  if (base.startsWith(".env") && base !== ".env.example") return true;

  const extension = path.extname(base).toLowerCase();
  return binaryExtensions.has(extension);
}

export function isUnsafeProjectRoot(projectPath: string): boolean {
  const normalized = path.resolve(projectPath);
  const home = path.resolve(os.homedir());
  const broadRoots = [
    home,
    path.join(home, "Documents"),
    path.join(home, "Desktop"),
    path.join(home, "Downloads"),
  ].map((item) => path.resolve(item));

  return broadRoots.includes(normalized);
}

async function walk(
  root: string,
  current: string,
  snapshot: Record<string, FileMeta>,
) {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relativePath = path.relative(root, fullPath).replaceAll("\\", "/");
    if (isIgnoredPath(relativePath)) continue;

    if (entry.isDirectory()) {
      await walk(root, fullPath, snapshot);
      continue;
    }

    if (!entry.isFile()) continue;

    try {
      const stats = await stat(fullPath);
      if (stats.size > 5_000_000) continue;
      snapshot[relativePath] = {
        path: relativePath,
        type: path.extname(entry.name).replace(".", "") || "file",
        size: stats.size,
        mtimeMs: Math.round(stats.mtimeMs),
      };
    } catch {
      continue;
    }
  }
}

async function collectTextFiles(root: string, current: string, files: string[]) {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relativePath = path.relative(root, fullPath).replaceAll("\\", "/");
    if (isIgnoredPath(relativePath)) continue;

    if (entry.isDirectory()) {
      await collectTextFiles(root, fullPath, files);
      continue;
    }

    if (!entry.isFile()) continue;
    if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(relativePath);
    }
  }
}

function runGit(projectPath: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: projectPath, timeout: 6_000, maxBuffer: 256_000 },
      (error, stdout) => {
        if (error) {
          resolve("");
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}
