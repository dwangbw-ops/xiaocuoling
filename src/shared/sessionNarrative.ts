import type { CodexSessionRecord } from "./types";

const metadataOnlyGoal = "Codex 全局历史使用过程（仅保存元数据，不保存完整 prompt）";

export interface SessionNarrative {
  projectName: string;
  projectPath: string;
  goal: string;
  items: string[];
}

export function buildSessionNarrative(session: CodexSessionRecord): SessionNarrative {
  const projectPath = session.projectPath.trim();
  const items = buildWorkItems(session);

  return {
    projectName: projectPath ? projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? projectPath : "未记录项目",
    projectPath: projectPath || "未记录路径",
    goal:
      session.taskGoal.trim() && session.taskGoal.trim() !== metadataOnlyGoal
        ? session.taskGoal.trim()
        : "未记录任务目标",
    items: items.length ? items : ["未记录具体操作"],
  };
}

function buildWorkItems(session: CodexSessionRecord): string[] {
  const items: string[] = [];

  if (session.changedFilesCount > 0) {
    items.push(
      `文件变化：${session.changedFilesCount} 个文件（新增 ${session.addedFilesCount}，修改 ${session.modifiedFilesCount}，删除 ${session.deletedFilesCount}）`,
    );
  }

  for (const command of session.commandsRun.slice(0, 4)) {
    items.push(`运行命令：${command.command}（${command.success ? "成功" : "失败"}）`);
  }

  if (session.buildSuccess) {
    items.push("验证结果：构建通过");
  }
  if (session.testSuccess) {
    items.push("验证结果：测试通过");
  }
  if (session.gitCommitCreated) {
    items.push("交付证据：创建了提交");
  }
  if (session.newDependencies.length) {
    items.push(`新增依赖：${session.newDependencies.join("、")}`);
  }
  if (session.detectedSkills.length) {
    items.push(`真实涉及能力：${session.detectedSkills.join("、")}`);
  }

  return items;
}
