import type { SyncSettings, SyncTarget } from "../domain/types";
import { targetIdentity } from "./syncTargetHelpers";

const STORAGE_KEY = "coinly.syncTargetLastSyncedAt";

export function readSyncLastSyncedAt(): Readonly<Record<string, string>> {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value ? JSON.parse(value) as Readonly<Record<string, string>> : {};
}

export function markSyncedTargets(
  current: Readonly<Record<string, string>>,
  settings: SyncSettings,
  target: SyncTarget | undefined,
  syncedAt: string,
): Readonly<Record<string, string>> {
  const next = syncedTargetTimes(current, settings, target, syncedAt);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function syncedTargetTimes(
  current: Readonly<Record<string, string>>,
  settings: SyncSettings,
  target: SyncTarget | undefined,
  syncedAt: string,
): Readonly<Record<string, string>> {
  return (settings.targets ?? []).reduce<Record<string, string>>((result, item) => {
    if (target && targetIdentity(item) !== targetIdentity(target)) return result;
    if (!target && !item.enabled) return result;
    return { ...result, [targetIdentity(item)]: syncedAt };
  }, { ...current });
}
