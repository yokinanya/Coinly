import { statementTransactions } from "./statements";
import type { AppData, CurrencyCode, Transaction } from "./types";

export interface CurrencySummary {
  readonly currency: CurrencyCode;
  readonly income: number;
  readonly expense: number;
}

export interface CategorySummary {
  readonly categoryId: string;
  readonly currency: CurrencyCode;
  readonly amount: number;
}

export interface MonthlyTrend {
  readonly month: string;
  readonly currency: CurrencyCode;
  readonly income: number;
  readonly expense: number;
}

export interface TagSummary {
  readonly tagId: string;
  readonly currency: CurrencyCode;
  readonly amount: number;
}

export interface ReportIndex {
  readonly entries: readonly ReportEntry[];
  readonly currentMonthEntries: readonly ReportEntry[];
  readonly currencySummary: readonly CurrencySummary[];
  readonly categorySummary: readonly CategorySummary[];
  readonly tagSummary: readonly TagSummary[];
  readonly monthlyTrends: readonly MonthlyTrend[];
}

export interface ReportIndexOptions {
  readonly now?: Date;
  readonly trendMonths?: number;
}

export interface ReportEntry {
  readonly kind: "income" | "expense";
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly occurredAt: string;
  readonly categoryId?: string;
  readonly tagIds: readonly string[];
}

export function reportEntries(data: AppData): readonly ReportEntry[] {
  return [
    ...data.transactions.flatMap((transaction) => transactionEntry(data, transaction)),
    ...settledStatementEntries(data),
  ];
}

export function summarizeByCurrency(entries: readonly ReportEntry[]): readonly CurrencySummary[] {
  const rows = new Map<CurrencyCode, CurrencySummary>();
  for (const entry of entries) {
    rows.set(entry.currency, applyCurrencySummary(rows.get(entry.currency), entry));
  }
  return [...rows.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}

export function summarizeByCategory(data: AppData, entries = reportEntries(data)): readonly CategorySummary[] {
  const rows = new Map<string, CategorySummary>();
  for (const entry of entries) {
    if (!entry.categoryId || entry.kind !== "expense") {
      continue;
    }
    const key = `${entry.categoryId}:${entry.currency}`;
    const current = rows.get(key);
    rows.set(key, {
      categoryId: entry.categoryId,
      currency: entry.currency,
      amount: (current?.amount ?? 0) + entry.amount,
    });
  }
  return [...rows.values()].sort((left, right) => right.amount - left.amount);
}

export function monthlyTrends(data: AppData, months = 6, now = new Date()): readonly MonthlyTrend[] {
  return monthlyTrendsFromEntries(reportEntries(data), months, now);
}

export function summarizeByTag(data: AppData, entries = reportEntries(data)): readonly TagSummary[] {
  const rows = new Map<string, TagSummary>();
  addTagSummaries(rows, entries);
  return [...rows.values()].sort((left, right) => right.amount - left.amount);
}

export function buildReportIndex(data: AppData, options: ReportIndexOptions = {}): ReportIndex {
  const now = options.now ?? new Date();
  const trendMonths = options.trendMonths ?? 6;
  const entries = reportEntries(data);
  const currentMonthEntries = currentMonthTransactions(entries, now);
  return {
    entries,
    currentMonthEntries,
    currencySummary: summarizeByCurrency(currentMonthEntries),
    categorySummary: summarizeByCategory(data, currentMonthEntries),
    tagSummary: summarizeByTag(data, currentMonthEntries),
    monthlyTrends: monthlyTrendsFromEntries(entries, trendMonths, now),
  };
}

export function currentMonthTransactions(
  transactions: readonly ReportEntry[],
  now: Date,
): readonly ReportEntry[] {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return transactions.filter((entry) => {
    return entry.occurredAt >= start && entry.occurredAt < end;
  });
}

export function monthlyTrendsFromEntries(
  entries: readonly ReportEntry[],
  months = 6,
  now = new Date(),
): readonly MonthlyTrend[] {
  const monthSet = new Set(monthKeys(months, now));
  const rows = new Map<string, MonthlyTrend>();
  for (const entry of entries) {
    const month = entry.occurredAt.slice(0, 7);
    if (!monthSet.has(month)) continue;
    const key = `${month}:${entry.currency}`;
    rows.set(key, applyMonthlyTrend(rows.get(key), entry, month));
  }
  return [...rows.values()].sort((left, right) => {
    return left.month.localeCompare(right.month) || left.currency.localeCompare(right.currency);
  });
}

export function spendingForBudget(data: AppData, budgetId: string): number {
  const budget = data.budgets.find((item) => item.id === budgetId);
  if (!budget) {
    throw new Error(`Budget not found: ${budgetId}`);
  }
  return reportEntries(data)
    .filter((entry) => matchesBudget(entry, budget.categoryIds, budget.tagIds))
    .reduce((total, entry) => total + entry.amount, 0);
}

function addTagSummaries(
  rows: Map<string, TagSummary>,
  entries: readonly ReportEntry[],
): void {
  for (const entry of entries) {
    if (entry.kind !== "expense") continue;
    for (const tagId of entry.tagIds) {
      const key = `${tagId}:${entry.currency}`;
      const current = rows.get(key);
      rows.set(key, { tagId, currency: entry.currency, amount: (current?.amount ?? 0) + entry.amount });
    }
  }
}

function applyCurrencySummary(
  current: CurrencySummary | undefined,
  entry: ReportEntry,
): CurrencySummary {
  const base = current ?? {
    currency: entry.currency,
    income: 0,
    expense: 0,
  };
  if (entry.kind === "income") {
    return { ...base, income: base.income + entry.amount };
  }
  if (entry.kind === "expense") {
    return { ...base, expense: base.expense + entry.amount };
  }
  return base;
}

function applyMonthlyTrend(
  current: MonthlyTrend | undefined,
  entry: ReportEntry,
  month: string,
): MonthlyTrend {
  const base = current ?? { month, currency: entry.currency, income: 0, expense: 0 };
  if (entry.kind === "income") return { ...base, income: base.income + entry.amount };
  return { ...base, expense: base.expense + entry.amount };
}

function monthKeys(months: number, now: Date): readonly string[] {
  return Array.from({ length: months }, (_unused, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - index - 1), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function matchesBudget(
  entry: ReportEntry,
  categoryIds: readonly string[],
  tagIds: readonly string[],
): boolean {
  const categoryMatches = categoryIds.length === 0 || categoryIds.includes(entry.categoryId ?? "");
  const tagMatches = tagIds.length === 0 || tagIds.some((tagId) => entry.tagIds.includes(tagId));
  return entry.kind === "expense" && categoryMatches && tagMatches;
}

function transactionEntry(data: AppData, transaction: Transaction): readonly ReportEntry[] {
  if (!shouldUseTransaction(data, transaction)) return [];
  if (transaction.kind === "refund") return refundEntry(transaction);
  return [{
    kind: transaction.kind,
    amount: transaction.amount,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt,
    categoryId: transaction.categoryId,
    tagIds: transaction.tagIds,
  }];
}

function refundEntry(transaction: Transaction): readonly ReportEntry[] {
  return [{
    kind: "expense",
    amount: -transaction.amount,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt,
    categoryId: transaction.categoryId,
    tagIds: transaction.tagIds,
  }];
}

function shouldUseTransaction(data: AppData, transaction: Transaction): transaction is Transaction & { readonly kind: "income" | "expense" | "refund" } {
  if (transaction.kind !== "income" && transaction.kind !== "expense" && transaction.kind !== "refund") return false;
  const account = data.accounts.find((item) => item.id === transaction.accountId);
  return account?.kind !== "credit" || transaction.kind === "refund";
}

function settledStatementEntries(data: AppData): readonly ReportEntry[] {
  return data.statements.flatMap((statement) => {
    if (!statement.paid || !statement.settlementAmount || !statement.settlementCurrency || !statement.settledAt) {
      return [];
    }
    return allocateStatementAmount(data, statement);
  });
}

function allocateStatementAmount(data: AppData, statement: AppData["statements"][number]): readonly ReportEntry[] {
  const transactions = statementTransactions(data.transactions, statement);
  const total = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const amount = statement.settlementAmount;
  const currency = statement.settlementCurrency;
  const occurredAt = statement.settledAt;
  if (total <= 0 || !amount || !currency || !occurredAt) {
    return [];
  }
  return transactions.map((transaction) => ({
    kind: "expense",
    amount: amount * (transaction.amount / total),
    currency,
    occurredAt,
    categoryId: transaction.categoryId,
    tagIds: transaction.tagIds,
  }));
}
