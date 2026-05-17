import type { AppData, EntityBase } from "../domain/types";
import { assertValidAppData } from "../storage/dataValidation";

type CollectionKey = "accounts" | "categories" | "tags" | "transactions" | "recurringRules" | "budgets" | "statements";

export interface SyncMergeResult {
  readonly data?: AppData;
  readonly conflict?: AppData;
}

const COLLECTION_KEYS: readonly CollectionKey[] = [
  "accounts",
  "categories",
  "tags",
  "transactions",
  "recurringRules",
  "budgets",
  "statements",
];

export function mergeSyncData(local: AppData, remotes: readonly AppData[]): SyncMergeResult {
  if (remotes.length === 0) return {};
  const merged = remotes.reduce<SyncMergeResult>((result, remote) => {
    if (!result.data || result.conflict) return result;
    return mergeTwoData(result.data, remote);
  }, { data: local });

  if (!merged.data || merged.conflict) return merged;
  if (isSameContentAsEverySnapshot(merged.data, local, remotes)) return {};
  const data = finalizeMergedData(local, merged.data);
  assertValidAppData(data);
  return canonicalSyncData(data) === canonicalSyncData(local) ? {} : { data };
}

function mergeTwoData(local: AppData, remote: AppData): SyncMergeResult {
  if (canonicalSyncData(local) === canonicalSyncData(remote)) return { data: local };
  const result = COLLECTION_KEYS.reduce<SyncMergeResult>((merged, key) => {
    if (!merged.data || merged.conflict) return merged;
    return mergeCollection(merged.data, remote, key);
  }, { data: { ...local, currencies: mergedCurrencies(local, remote) } });
  return result;
}

function mergeCollection(data: AppData, remote: AppData, key: CollectionKey): SyncMergeResult {
  const result = mergeEntities(data[key] as readonly EntityBase[], remote[key] as readonly EntityBase[]);
  if (result.conflict) return { conflict: remote };
  return { data: { ...data, [key]: result.entities } };
}

function mergeEntities<T extends EntityBase>(
  local: readonly T[],
  remote: readonly T[],
): { readonly entities?: readonly T[]; readonly conflict?: T } {
  const localById = entityMap(local);
  const remoteById = entityMap(remote);
  const ids = [...new Set([...localById.keys(), ...remoteById.keys()])];
  const entities: T[] = [];
  for (const id of ids) {
    const entity = mergedEntity(localById.get(id), remoteById.get(id));
    if (entity.conflict) return { conflict: entity.conflict };
    entities.push(entity.value);
  }
  return { entities };
}

function entityMap<T extends EntityBase>(entities: readonly T[]): ReadonlyMap<string, T> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function mergedEntity<T extends EntityBase>(
  local: T | undefined,
  remote: T | undefined,
): { readonly value: T; readonly conflict?: T } {
  if (!local && remote) return { value: remote };
  if (local && !remote) return { value: local };
  if (!local || !remote) throw new Error("同步合并实体缺失");
  if (JSON.stringify(local) === JSON.stringify(remote)) return { value: local };
  if (dataTimestampForEntity(local) === dataTimestampForEntity(remote)) return { value: local, conflict: remote };
  return dataTimestampForEntity(local) > dataTimestampForEntity(remote) ? { value: local } : { value: remote };
}

function finalizeMergedData(local: AppData, merged: AppData): AppData {
  return {
    ...merged,
    updatedAt: new Date().toISOString(),
    localVersion: Math.max(local.localVersion, merged.localVersion) + 1,
    syncSettings: local.syncSettings,
    aiSettings: local.aiSettings,
    uiSettings: local.uiSettings,
  };
}

function mergedCurrencies(local: AppData, remote: AppData): readonly string[] {
  return [...new Set([...local.currencies, ...remote.currencies])];
}

function dataTimestampForEntity(entity: EntityBase): number {
  const timestamp = Date.parse(entity.updatedAt);
  if (Number.isNaN(timestamp)) throw new Error("实体更新时间无效，无法同步合并");
  return timestamp;
}

function canonicalSyncData(data: AppData): string {
  return JSON.stringify({
    ...data,
    localVersion: undefined,
    syncSettings: undefined,
    aiSettings: undefined,
    uiSettings: undefined,
  });
}

function canonicalContentData(data: AppData): string {
  return JSON.stringify({
    ...data,
    updatedAt: undefined,
    localVersion: undefined,
    syncSettings: undefined,
    aiSettings: undefined,
    uiSettings: undefined,
  });
}

function isSameContentAsEverySnapshot(
  data: AppData,
  local: AppData,
  remotes: readonly AppData[],
): boolean {
  const value = canonicalContentData(data);
  return [local, ...remotes].every((item) => canonicalContentData(item) === value);
}
