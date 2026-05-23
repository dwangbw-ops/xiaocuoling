import type { XiaocuolingApi } from "../preload/preload";

declare global {
  interface Window {
    xiaocuoling: XiaocuolingApi;
  }
}

export {};
