import type { AppData, EntityBase, RecurringRule, Transaction } from "../domain/types";
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
  const result = key === "transactions"
    ? mergeTransactions(data.transactions, remote.transactions, data.recurringRules, remote.recurringRules)
    : mergeEntities(data[key] as readonly EntityBase[], remote[key] as readonly EntityBase[]);
  if (result.conflict) return { conflict: remote };
  return { data: { ...data, [key]: result.entities } };
}

function mergeTransactions(
  local: readonly Transaction[],
  remote: readonly Transaction[],
  localRules: readonly RecurringRule[],
  remoteRules: readonly RecurringRule[],
): { readonly entities?: readonly Transaction[]; readonly conflict?: Transaction } {
  const result = mergeEntities(local, remote);
  if (result.conflict || !result.entities) return result;
  return { entities: mergeRecurringTransactions(result.entities, local, remote, localRules, remoteRules) };
}

function mergeRecurringTransactions(
  transactions: readonly Transaction[],
  local: readonly Transaction[],
  remote: readonly Transaction[],
  localRules: readonly RecurringRule[],
  remoteRules: readonly RecurringRule[],
): readonly Transaction[] {
  const localOccurrences = recurringOccurrenceKeys(local);
  const remoteOccurrences = recurringOccurrenceKeys(remote);
  const grouped = new Map<string, Transaction[]>();
  const deletedRecurringTransactionIds = new Set<string>();

  for (const transaction of transactions) {
    const key = recurringOccurrenceKey(transaction);
    if (!key) continue;
    if (shouldDropRecurringTransaction(transaction, key, localOccurrences, remoteOccurrences, localRules, remoteRules)) {
      deletedRecurringTransactionIds.add(transaction.id);
      continue;
    }
    grouped.set(key, [...(grouped.get(key) ?? []), transaction]);
  }

  const winners = new Map([...grouped].map(([key, group]) => [key, newestEntity(group)]));
  const replacementTransactionIds = recurringReplacementIds(grouped, winners);
  return transactions.flatMap((transaction) => {
    const key = recurringOccurrenceKey(transaction);
    if (!key) return resolvedRefundReference(transaction, replacementTransactionIds, deletedRecurringTransactionIds);
    const winner = winners.get(key);
    if (!winner || winner.id !== transaction.id) return [];
    winners.delete(key);
    return resolvedRefundReference(winner, replacementTransactionIds, deletedRecurringTransactionIds);
  });
}

function recurringReplacementIds(
  grouped: ReadonlyMap<string, readonly Transaction[]>,
  winners: ReadonlyMap<string, Transaction>,
): ReadonlyMap<string, string> {
  const replacements = new Map<string, string>();
  for (const [key, group] of grouped) {
    const winner = winners.get(key);
    if (!winner) continue;
    group.forEach((transaction) => {
      if (transaction.id !== winner.id) replacements.set(transaction.id, winner.id);
    });
  }
  return replacements;
}

function resolvedRefundReference(
  transaction: Transaction,
  replacementTransactionIds: ReadonlyMap<string, string>,
  deletedRecurringTransactionIds: ReadonlySet<string>,
): readonly Transaction[] {
  const refundOfTransactionId = transaction.refundOfTransactionId;
  if (!refundOfTransactionId) return [transaction];
  const replacementId = replacementTransactionIds.get(refundOfTransactionId);
  if (replacementId) return [{ ...transaction, refundOfTransactionId: replacementId }];
  return deletedRecurringTransactionIds.has(refundOfTransactionId) ? [] : [transaction];
}

function shouldDropRecurringTransaction(
  transaction: Transaction,
  key: string,
  localOccurrences: ReadonlySet<string>,
  remoteOccurrences: ReadonlySet<string>,
  localRules: readonly RecurringRule[],
  remoteRules: readonly RecurringRule[],
): boolean {
  const localHasOccurrence = localOccurrences.has(key);
  const remoteHasOccurrence = remoteOccurrences.has(key);
  if (localHasOccurrence && remoteHasOccurrence) return false;
  if (!localHasOccurrence && remoteHasOccurrence) return ruleAdvancedPastOccurrence(localRules, transaction);
  if (localHasOccurrence && !remoteHasOccurrence) return ruleAdvancedPastOccurrence(remoteRules, transaction);
  return false;
}

function recurringOccurrenceKeys(transactions: readonly Transaction[]): ReadonlySet<string> {
  return new Set(transactions.map(recurringOccurrenceKey).filter(isPresent));
}

function recurringOccurrenceKey(transaction: Transaction): string | undefined {
  return transaction.sourceRecurringRuleId
    ? `${transaction.sourceRecurringRuleId}\u0000${transaction.occurredAt}`
    : undefined;
}

function ruleAdvancedPastOccurrence(rules: readonly RecurringRule[], transaction: Transaction): boolean {
  const rule = rules.find((item) => item.id === transaction.sourceRecurringRuleId);
  if (!rule) return false;
  const nextRunAt = Date.parse(rule.nextRunAt);
  const occurredAt = Date.parse(transaction.occurredAt);
  if (Number.isNaN(nextRunAt) || Number.isNaN(occurredAt)) return false;
  return nextRunAt > occurredAt;
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

function newestEntity<T extends EntityBase>(entities: readonly T[]): T {
  return entities.reduce((newest, entity) => {
    return dataTimestampForEntity(entity) > dataTimestampForEntity(newest) ? entity : newest;
  });
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

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}
