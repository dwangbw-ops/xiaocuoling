import path from "node:path";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { JsonStore } from "./storage";
import { SessionManager } from "./sessionManager";
import {
  createPetWindowOptions,
  desktopOnlyPetWindowPolicy,
} from "./windowPolicy";

let petWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let manager: SessionManager;
let isQuitting = false;

const isDev = !app.isPackaged;

app.whenReady().then(() => {
  const dataDir = path.join(app.getPath("userData"), "xiaocuoling-data");
  const store = new JsonStore(dataDir);
  manager = new SessionManager(store, broadcastSnapshot);
  manager.startReportScheduler();
  registerIpc();
  createPetWindow();
  createPanelWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
      createPanelWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  manager?.stopReportScheduler();
});

function createPetWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow(
    createPetWindowOptions(workArea, path.join(__dirname, "../preload/preload.js")),
  );
  const policy = desktopOnlyPetWindowPolicy();
  petWindow.setAlwaysOnTop(false);
  petWindow.setVisibleOnAllWorkspaces(policy.visibleOnAllWorkspaces, {
    visibleOnFullScreen: policy.visibleOnFullScreen,
  });
  loadRenderer(petWindow, "pet");
}

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    width: 1040,
    height: 780,
    minWidth: 920,
    minHeight: 680,
    show: false,
    title: "小搓灵",
    backgroundColor: "#0b0c10",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadRenderer(panelWindow, "panel");
  panelWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      panelWindow?.hide();
    }
  });
}

function loadRenderer(window: BrowserWindow, view: "pet" | "panel") {
  if (isDev) {
    window.loadURL(`http://127.0.0.1:5278/?view=${view}`);
  } else {
    window.loadFile(path.join(__dirname, "../../dist/index.html"), {
      query: { view },
    });
  }
}

function registerIpc() {
  ipcMain.handle("app:get-state", () => manager.getSnapshot());
  ipcMain.handle("app:get-commands", () => manager.getCommands());
  ipcMain.handle("app:open-panel", () => {
    panelWindow?.show();
    panelWindow?.focus();
    return manager.getSnapshot();
  });
  ipcMain.handle("app:reset-data", () => manager.resetData());
  ipcMain.handle("project:select", async () => manager.selectProject(panelWindow ?? undefined));
  ipcMain.handle("codex:calibrate-baseline", async (_event, projectId?: string) =>
    manager.calibrateFromCodex(projectId),
  );
  ipcMain.handle("codex-link:status", async (_event, projectId?: string) =>
    manager.getCodexLinkStatus(projectId),
  );
  ipcMain.handle("codex-link:install-hooks", async (_event, projectId: string) =>
    manager.installCodexProjectHooks(projectId),
  );
  ipcMain.handle("codex-link:connect-global", async () =>
    manager.connectCodexGlobally(),
  );
  ipcMain.handle("codex-link:events", async (_event, limit?: number) =>
    manager.getCodexHookEvents(limit),
  );
  ipcMain.handle("codex-link:disconnect", async (_event, projectId?: string) =>
    manager.disconnectCodex(projectId),
  );
  ipcMain.handle("session:start", async (_event, input) => manager.startSession(input));
  ipcMain.handle("session:end", async () => manager.endSession());
  ipcMain.handle("command:run", async (_event, command: string) =>
    manager.runCommand(command),
  );
}

function broadcastSnapshot() {
  const snapshot = manager.getSnapshot();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("app:state-updated", snapshot);
  }
}
