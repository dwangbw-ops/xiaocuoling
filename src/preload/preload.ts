import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSnapshot,
  CodexEventEvidence,
  CodexHookEvent,
  CodexLinkStatus,
  CommandRecord,
} from "../shared/types";

export interface XiaocuolingApi {
  getState: () => Promise<AppSnapshot>;
  getCommands: () => Promise<string[]>;
  openPanel: () => Promise<AppSnapshot>;
  resetData: () => Promise<AppSnapshot>;
  selectProject: () => Promise<AppSnapshot>;
  calibrateFromCodex: (projectId?: string) => Promise<AppSnapshot>;
  getCodexLinkStatus: (projectId?: string) => Promise<CodexLinkStatus>;
  connectCodexGlobal: () => Promise<{
    snapshot: AppSnapshot;
    status: CodexLinkStatus;
    events: CodexHookEvent[];
  }>;
  installCodexHooks: (projectId: string) => Promise<CodexLinkStatus>;
  getCodexHookEvents: (limit?: number) => Promise<{
    events: CodexHookEvent[];
    evidence: CodexEventEvidence;
  }>;
  disconnectCodex: (projectId?: string) => Promise<CodexLinkStatus>;
  startSession: (input: {
    projectId: string;
    taskGoal: string;
  }) => Promise<AppSnapshot>;
  endSession: () => Promise<AppSnapshot>;
  runCommand: (
    command: string,
  ) => Promise<{ snapshot: AppSnapshot; command: CommandRecord }>;
  onStateUpdated: (handler: (snapshot: AppSnapshot) => void) => () => void;
}

const api: XiaocuolingApi = {
  getState: () => ipcRenderer.invoke("app:get-state"),
  getCommands: () => ipcRenderer.invoke("app:get-commands"),
  openPanel: () => ipcRenderer.invoke("app:open-panel"),
  resetData: () => ipcRenderer.invoke("app:reset-data"),
  selectProject: () => ipcRenderer.invoke("project:select"),
  calibrateFromCodex: (projectId) => ipcRenderer.invoke("codex:calibrate-baseline", projectId),
  getCodexLinkStatus: (projectId) => ipcRenderer.invoke("codex-link:status", projectId),
  connectCodexGlobal: () => ipcRenderer.invoke("codex-link:connect-global"),
  installCodexHooks: (projectId) =>
    ipcRenderer.invoke("codex-link:install-hooks", projectId),
  getCodexHookEvents: (limit) => ipcRenderer.invoke("codex-link:events", limit),
  disconnectCodex: (projectId) => ipcRenderer.invoke("codex-link:disconnect", projectId),
  startSession: (input) => ipcRenderer.invoke("session:start", input),
  endSession: () => ipcRenderer.invoke("session:end"),
  runCommand: (command) => ipcRenderer.invoke("command:run", command),
  onStateUpdated: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => {
      handler(snapshot);
    };
    ipcRenderer.on("app:state-updated", listener);
    return () => ipcRenderer.off("app:state-updated", listener);
  },
};

contextBridge.exposeInMainWorld("xiaocuoling", api);
