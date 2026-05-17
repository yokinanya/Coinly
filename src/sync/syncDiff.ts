import type { AppData, EntityBase } from "../domain/types";

export type DiffKind = "local-only" | "remote-only" | "local-newer" | "remote-newer" | "same-time-conflict";

export interface CollectionDiffSummary {
  readonly key: DiffCollectionKey;
  readonly label: string;
  readonly localOnly: number;
  readonly remoteOnly: number;
  readonly localNewer: number;
  readonly remoteNewer: number;
  readonly sameTimeConflicts: number;
}

export interface SyncDiffSummary {
  readonly collections: readonly CollectionDiffSummary[];
  readonly currencyLocalOnly: number;
  readonly currencyRemoteOnly: number;
}

type DiffCollectionKey = "accounts" | "categories" | "tags" | "transactions" | "recurringRules" | "budgets" | "statements";

const COLLECTIONS: readonly { readonly key: DiffCollectionKey; readonly label: string }[] = [
  { key: "accounts", label: "账户" },
  { key: "categories", label: "分类" },
  { key: "tags", label: "标签" },
  { key: "transactions", label: "交易" },
  { key: "recurringRules", label: "订阅规则" },
  { key: "budgets", label: "预算" },
  { key: "statements", label: "账期" },
];

export function summarizeSyncDiff(local: AppData, remote: AppData): SyncDiffSummary {
  return {
    collections: COLLECTIONS.map((collection) => summarizeCollection(local[collection.key], remote[collection.key], collection)),
    currencyLocalOnly: missingCount(local.currencies, remote.currencies),
    currencyRemoteOnly: missingCount(remote.currencies, local.currencies),
  };
}

export function hasDiff(summary: SyncDiffSummary): boolean {
  return summary.currencyLocalOnly > 0
    || summary.currencyRemoteOnly > 0
    || summary.collections.some((item) => collectionDiffTotal(item) > 0);
}

export function collectionDiffTotal(summary: CollectionDiffSummary): number {
  return summary.localOnly + summary.remoteOnly + summary.localNewer + summary.remoteNewer + summary.sameTimeConflicts;
}

function summarizeCollection(
  local: readonly EntityBase[],
  remote: readonly EntityBase[],
  collection: { readonly key: DiffCollectionKey; readonly label: string },
): CollectionDiffSummary {
  const entries = diffKinds(local, remote);
  return {
    ...collection,
    localOnly: countKind(entries, "local-only"),
    remoteOnly: countKind(entries, "remote-only"),
    localNewer: countKind(entries, "local-newer"),
    remoteNewer: countKind(entries, "remote-newer"),
    sameTimeConflicts: countKind(entries, "same-time-conflict"),
  };
}

function diffKinds<T extends EntityBase>(local: readonly T[], remote: readonly T[]): readonly DiffKind[] {
  const localById = entityMap(local);
  const remoteById = entityMap(remote);
  return [...new Set([...localById.keys(), ...remoteById.keys()])]
    .map((id) => diffKind(localById.get(id), remoteById.get(id)))
    .filter(isPresent);
}

function diffKind<T extends EntityBase>(local: T | undefined, remote: T | undefined): DiffKind | undefined {
  if (!local && remote) return "remote-only";
  if (local && !remote) return "local-only";
  if (!local || !remote || JSON.stringify(local) === JSON.stringify(remote)) return undefined;
  const localTime = entityTimestamp(local);
  const remoteTime = entityTimestamp(remote);
  if (localTime === remoteTime) return "same-time-conflict";
  return localTime > remoteTime ? "local-newer" : "remote-newer";
}

function entityMap<T extends EntityBase>(entities: readonly T[]): ReadonlyMap<string, T> {
  return new Map(entities.map((entity) => [entity.id, entity]));
}

function countKind(kinds: readonly DiffKind[], kind: DiffKind): number {
  return kinds.filter((item) => item === kind).length;
}

function missingCount(left: readonly string[], right: readonly string[]): number {
  const rightValues = new Set(right);
  return left.filter((item) => !rightValues.has(item)).length;
}

function entityTimestamp(entity: EntityBase): number {
  const timestamp = Date.parse(entity.updatedAt);
  if (Number.isNaN(timestamp)) throw new Error("实体更新时间无效，无法解析同步差异");
  return timestamp;
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}
