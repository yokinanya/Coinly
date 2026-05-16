import { bumpVersion, createId, nowIso } from "./factory";
import type { AppData, RecurringRule, Transaction } from "./types";

export function materializeDueRecurring(data: AppData, now = new Date()): AppData {
  const dueRules = data.recurringRules.filter((rule) => rule.enabled && rule.nextRunAt <= now.toISOString());
  if (dueRules.length === 0) {
    return data;
  }
  const created = dueRules.map((rule) => transactionFromRule(rule));
  const recurringRules = data.recurringRules.map((rule) => advanceRuleIfDue(rule, now));
  return bumpVersion({
    ...data,
    recurringRules,
    transactions: [...data.transactions, ...created],
  });
}

function transactionFromRule(rule: RecurringRule): Transaction {
  const timestamp = nowIso();
  return {
    id: createId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...rule.transaction,
    occurredAt: rule.nextRunAt,
    sourceRecurringRuleId: rule.id,
  };
}

function advanceRuleIfDue(rule: RecurringRule, now: Date): RecurringRule {
  if (!rule.enabled || rule.nextRunAt > now.toISOString()) {
    return rule;
  }
  return { ...rule, nextRunAt: nextRun(rule.nextRunAt, rule.interval), updatedAt: nowIso() };
}

function nextRun(value: string, interval: RecurringRule["interval"]): string {
  const date = new Date(value);
  if (interval === "daily") {
    date.setDate(date.getDate() + 1);
  }
  if (interval === "monthly") {
    date.setMonth(date.getMonth() + 1);
  }
  if (interval === "yearly") {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toISOString();
}
