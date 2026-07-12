import type { CurrencyCode, RecurringRule } from "../domain/types";

export interface RecurringSummaryData {
  readonly enabledCount: number;
  readonly upcomingCount: number;
  readonly amounts: readonly { readonly currency: CurrencyCode; readonly amount: number }[];
}

export function summarizeRecurringRules(rules: readonly RecurringRule[], today: Date): RecurringSummaryData {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  const enabledRules = rules.filter((rule) => rule.enabled);
  const upcoming = enabledRules.filter((rule) => {
    const date = localDate(rule.nextRunAt);
    return date >= start && date <= end;
  });
  const amounts = new Map<CurrencyCode, number>();
  upcoming.forEach((rule) => amounts.set(rule.transaction.currency, (amounts.get(rule.transaction.currency) ?? 0) + rule.transaction.amount));
  return {
    enabledCount: enabledRules.length,
    upcomingCount: upcoming.length,
    amounts: [...amounts].map(([currency, amount]) => ({ currency, amount })),
  };
}

function localDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}