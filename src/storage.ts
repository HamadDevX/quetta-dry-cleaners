import { defaultSnapshot } from "./defaultData";
import { AppSnapshot } from "./types";

const STORAGE_KEY = "quetta_dry_cleaners_snapshot";

const clone = (snapshot: AppSnapshot): AppSnapshot => JSON.parse(JSON.stringify(snapshot)) as AppSnapshot;

export const loadSnapshot = async (): Promise<AppSnapshot> => {
  if (window.desktopBridge) {
    const snapshot = await window.desktopBridge.loadSnapshot();
    return snapshot ?? clone(defaultSnapshot);
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSnapshot));
    return clone(defaultSnapshot);
  }

  try {
    return JSON.parse(raw) as AppSnapshot;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSnapshot));
    return clone(defaultSnapshot);
  }
};

export const saveSnapshot = async (snapshot: AppSnapshot): Promise<{ ok: boolean; message: string }> => {
  if (window.desktopBridge) {
    return window.desktopBridge.saveSnapshot(snapshot);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return { ok: true, message: "Saved locally" };
};