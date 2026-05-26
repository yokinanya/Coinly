import type { AppData } from "./types";

export function withoutLocalOnlyUiSettings(data: AppData): AppData {
  if (!data.uiSettings?.syncTargetLastSyncedAt) return data;
  return {
    ...data,
    uiSettings: {
      ...data.uiSettings,
      syncTargetLastSyncedAt: undefined,
    },
  };
}
