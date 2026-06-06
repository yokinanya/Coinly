import { bumpVersion, nowIso } from "./factory";
import type { Account, AppData, RecurringRule, Transaction } from "./types";

export const LOOKBACK_MONTHS = 1;

export function materializeDueRecurring(data: AppData, now = new Date()): AppData {
  const dueRules = data.recurringRules.filter((rule) => rule.enabled && rule.nextRunAt <= now.toISOString());
  if (dueRules.length === 0) {
    return data;
  }
  const existingOccurrences = new Set(data.transactions.map(recurringOccurrenceKey).filter(isPresent));
  const created = dueRules
    .filter((rule) => !existingOccurrences.has(recurringOccurrenceKeyForRule(rule)))
    .map((rule) => transactionFromRule(rule));
  const recurringRules = data.recurringRules.map((rule) => advanceRuleIfDue(rule, now));
  return bumpVersion({
    ...data,
    recurringRules,
    transactions: [...data.transactions, ...created],
  });
}

export function accountCurrencyOptions(account: Account): readonly string[] {
  if (account.kind === "credit") {
    return account.currencyCodes?.length ? account.currencyCodes : [account.currency];
  }
  return [account.currency];
}

export function currencyForAccount(account: Account, currentCurrency: string): string {
  const currencies = accountCurrencyOptions(account);
  return currencies.includes(currentCurrency) ? currentCurrency : currencies[0];
}

export function defaultNextRunAt(interval: RecurringRule["interval"], now = new Date()): string {
  const date = startOfDay(now);
  if (interval === "monthly") date.setMonth(date.getMonth() + 1);
  if (interval === "yearly") date.setFullYear(date.getFullYear() + 1);
  return date.toISOString();
}

export function earliestAllowedStartAt(now = new Date()): string {
  const date = startOfDay(now);
  date.setMonth(date.getMonth() - LOOKBACK_MONTHS);
  return date.toISOString();
}

export function validateRecurringRule(data: AppData, rule: RecurringRule, now = new Date()): void {
  const account = data.accounts.find((item) => item.id === rule.transaction.accountId);
  if (!account) throw new Error("支付方式不存在");
  if (!accountCurrencyOptions(account).includes(rule.transaction.currency)) {
    throw new Error("支付币种与支付方式不匹配");
  }
  validateRecurringCategory(data, rule);
  if (!Number.isFinite(new Date(rule.nextRunAt).getTime())) {
    throw new Error("开始日期无效");
  }
  if (rule.nextRunAt < earliestAllowedStartAt(now)) {
    throw new Error("开始日期不能早于一个月前");
  }
}

function transactionFromRule(rule: RecurringRule): Transaction {
  const timestamp = nowIso();
  return {
    id: recurringTransactionId(rule),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...rule.transaction,
    occurredAt: rule.nextRunAt,
    note: recurringTransactionNote(rule),
    sourceRecurringRuleId: rule.id,
  };
}

function recurringTransactionId(rule: RecurringRule): string {
  return `recurring:${rule.id}:${rule.nextRunAt}`;
}

function recurringOccurrenceKey(transaction: Transaction): string | undefined {
  return transaction.sourceRecurringRuleId
    ? `${transaction.sourceRecurringRuleId}\u0000${transaction.occurredAt}`
    : undefined;
}

function recurringOccurrenceKeyForRule(rule: RecurringRule): string {
  return `${rule.id}\u0000${rule.nextRunAt}`;
}

function recurringTransactionNote(rule: RecurringRule): string {
  const note = rule.transaction.note.trim();
  return note ? `${rule.name}：${note}` : rule.name;
}

function validateRecurringCategory(data: AppData, rule: RecurringRule): void {
  const categoryId = rule.transaction.categoryId;
  if (!categoryId) return;
  const category = data.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error("分类不存在");
  if (category.direction !== "expense") throw new Error("订阅分类必须是支出分类");
}

function advanceRuleIfDue(rule: RecurringRule, now: Date): RecurringRule {
  if (!rule.enabled || rule.nextRunAt > now.toISOString()) {
    return rule;
  }
  return { ...rule, nextRunAt: nextRun(rule.nextRunAt, rule.interval), updatedAt: nowIso() };
}

function nextRun(value: string, interval: RecurringRule["interval"]): string {
  const date = new Date(value);
  if (interval === "monthly") {
    date.setMonth(date.getMonth() + 1);
  }
  if (interval === "yearly") {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toISOString();
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}
