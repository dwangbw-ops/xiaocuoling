import { describe, expect, it } from "vitest";
import {
  createPetWindowOptions,
  desktopOnlyPetWindowPolicy,
} from "../src/main/windowPolicy";

describe("desktop pet window policy", () => {
  it("keeps the pet small, transparent, and not always on top", () => {
    const options = createPetWindowOptions(
      { x: 0, y: 0, width: 1440, height: 900 },
      "/tmp/preload.js",
    );

    expect(options.width).toBe(140);
    expect(options.height).toBe(160);
    expect(options.x).toBe(1276);
    expect(options.y).toBe(700);
    expect(options.transparent).toBe(true);
    expect(options.frame).toBe(false);
    expect(options.alwaysOnTop).toBe(false);
    expect(options.skipTaskbar).toBe(true);
  });

  it("does not show the pet over every app or fullscreen workspace", () => {
    expect(desktopOnlyPetWindowPolicy()).toEqual({
      visibleOnAllWorkspaces: false,
      visibleOnFullScreen: false,
    });
  });
});
