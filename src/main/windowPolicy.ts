import type { BrowserWindowConstructorOptions } from "electron";

export interface WorkAreaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createPetWindowOptions(
  workArea: WorkAreaBounds,
  preloadPath: string,
): BrowserWindowConstructorOptions {
  const width = 140;
  const height = 160;
  return {
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 40,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

export function desktopOnlyPetWindowPolicy(): {
  visibleOnAllWorkspaces: boolean;
  visibleOnFullScreen: boolean;
} {
  return {
    visibleOnAllWorkspaces: false,
    visibleOnFullScreen: false,
  };
}
