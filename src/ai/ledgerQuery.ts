import type { AppData, Transaction, TransactionKind } from "../domain/types";

export type LedgerMetric = "count" | "sum";
export type LedgerGroupBy = "none" | "month" | "account" | "category" | "tag" | "kind" | "currency";

export interface LedgerQuery {
  readonly startAt?: string;
  readonly endAt?: string;
  readonly accountIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly tagIds?: readonly string[];
  readonly kinds?: readonly TransactionKind[];
  readonly currencies?: readonly string[];
  readonly metric: LedgerMetric;
  readonly groupBy: LedgerGroupBy;
}

export interface LedgerQueryRow {
  readonly key: string;
  readonly count: number;
  readonly amountByCurrency: Readonly<Record<string, number>>;
}

export interface LedgerQueryResult {
  readonly query: LedgerQuery;
  readonly matchedCount: number;
  readonly amountByCurrency: Readonly<Record<string, number>>;
  readonly rows: readonly LedgerQueryRow[];
  readonly complete: true;
}

const METRICS: readonly LedgerMetric[] = ["count", "sum"];
const GROUPS: readonly LedgerGroupBy[] = ["none", "month", "account", "category", "tag", "kind", "currency"];
const KINDS: readonly TransactionKind[] = ["income", "expense", "refund", "transfer", "credit_payment"];

export function parseLedgerQuery(value: unknown): LedgerQuery {
  const raw = objectValue(value, "query_ledger 参数必须是对象");
  rejectUnknown(raw, ["startAt", "endAt", "accountIds", "categoryIds", "tagIds", "kinds", "currencies", "metric", "groupBy"]);
  const metric = enumValue(raw.metric, METRICS, "metric");
  const groupBy = enumValue(raw.groupBy, GROUPS, "groupBy");
  const query: LedgerQuery = {
    startAt: optionalDate(raw.startAt, "startAt"),
    endAt: optionalDate(raw.endAt, "endAt"),
    accountIds: optionalStrings(raw.accountIds, "accountIds"),
    categoryIds: optionalStrings(raw.categoryIds, "categoryIds"),
    tagIds: optionalStrings(raw.tagIds, "tagIds"),
    kinds: optionalEnums(raw.kinds, KINDS, "kinds"),
    currencies: optionalStrings(raw.currencies, "currencies"),
    metric,
    groupBy,
  };
  if (query.startAt && query.endAt && query.startAt > query.endAt) {
    throw new Error("query_ledger 的 startAt 不能晚于 endAt");
  }
  return query;
}

export function executeLedgerQuery(data: AppData, query: LedgerQuery): LedgerQueryResult {
  const matched = data.transactions.filter((transaction) => matches(transaction, query));
  const amountByCurrency = amounts(matched);
  const groups = new Map<string, Transaction[]>();
  for (const transaction of matched) {
    for (const key of groupKeys(transaction, query.groupBy)) {
      groups.set(key, [...(groups.get(key) ?? []), transaction]);
    }
  }
  const rows = [...groups.entries()].map(([key, transactions]) => ({
    key,
    count: transactions.length,
    amountByCurrency: amounts(transactions),
  }));
  return { query, matchedCount: matched.length, amountByCurrency, rows, complete: true };
}

function matches(transaction: Transaction, query: LedgerQuery): boolean {
  const occurredDate = transaction.occurredAt.slice(0, 10);
  if (query.startAt && occurredDate < query.startAt.slice(0, 10)) return false;
  if (query.endAt && occurredDate > query.endAt.slice(0, 10)) return false;
  if (query.accountIds && !query.accountIds.includes(transaction.accountId)) return false;
  if (query.categoryIds && (!transaction.categoryId || !query.categoryIds.includes(transaction.categoryId))) return false;
  if (query.tagIds && !query.tagIds.every((tagId) => transaction.tagIds.includes(tagId))) return false;
  if (query.kinds && !query.kinds.includes(transaction.kind)) return false;
  return !query.currencies || query.currencies.includes(transaction.currency);
}

function groupKeys(transaction: Transaction, groupBy: LedgerGroupBy): readonly string[] {
  if (groupBy === "none") return ["all"];
  if (groupBy === "month") return [transaction.occurredAt.slice(0, 7)];
  if (groupBy === "account") return [transaction.accountId];
  if (groupBy === "category") return [transaction.categoryId ?? "uncategorized"];
  if (groupBy === "tag") return transaction.tagIds.length > 0 ? transaction.tagIds : ["untagged"];
  if (groupBy === "kind") return [transaction.kind];
  return [transaction.currency];
}

function amounts(transactions: readonly Transaction[]): Readonly<Record<string, number>> {
  return transactions.reduce<Record<string, number>>((result, transaction) => ({
    ...result,
    [transaction.currency]: (result[transaction.currency] ?? 0) + signedAmount(transaction),
  }), {});
}

function signedAmount(transaction: Transaction): number {
  if (transaction.kind === "expense" || transaction.kind === "credit_payment") return -transaction.amount;
  return transaction.amount;
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`read_ledger 包含未知字段：${unknown.join(", ")}`);
}

function enumValue<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`read_ledger 的 ${name} 无效`);
  return value as T;
}

function optionalEnums<T extends string>(value: unknown, values: readonly T[], name: string): readonly T[] | undefined {
  const items = optionalStrings(value, name);
  if (!items) return undefined;
  if (!items.every((item) => values.includes(item as T))) throw new Error(`read_ledger 的 ${name} 包含无效值`);
  return items as readonly T[];
}

function optionalStrings(value: unknown, name: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new Error(`read_ledger 的 ${name} 必须是非空字符串数组`);
  }
  return value.map((item) => item.trim());
}

function optionalDate(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    throw new Error(`read_ledger 的 ${name} 必须是 ISO 日期`);
  }
  return value;
}
