import {
  buildReportIndex,
  summarizeByCategory,
  summarizeByCurrency,
  summarizeByTag,
  type ReportEntry,
} from "../domain/analytics";
import type { AiModelSettings, AppData, Budget, Transaction } from "../domain/types";
import { estimateTokens, type ContextMeta } from "./context";
import { resolveAiModelCapabilities } from "./modelCapabilities";

export type AnalysisScope = "current-month" | "last-3-months" | "last-6-months" | "year-to-date";

interface AnalysisOptions {
  readonly settings: AiModelSettings;
  readonly now?: Date;
  readonly trendMonths?: number;
  readonly analysisScope?: AnalysisScope;
}

interface AnalysisPeriod {
  readonly label: string;
  readonly startAt: string;
  readonly endAt: string;
}

interface BudgetInsight {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  readonly currency: string;
  readonly period: string;
  readonly spent: number;
}

interface TransactionInsight {
  readonly kind: string;
  readonly amount: number;
  readonly currency: string;
  readonly occurredAt: string;
  readonly categoryId?: string;
  readonly tagIds: readonly string[];
  readonly note: string;
}

export interface AnalysisContext {
  readonly contextMeta: ContextMeta;
  readonly period: AnalysisPeriod;
  readonly ledger: {
    readonly transactionCount: number;
    readonly accountCount: number;
    readonly currencies: readonly string[];
    readonly reportingRules: readonly string[];
  };
  readonly selectedRange: {
    readonly entryCount: number;
    readonly currencySummary: unknown;
    readonly categorySummary: unknown;
    readonly tagSummary: unknown;
  };
  readonly monthlyTrends: unknown;
  readonly budgets: readonly BudgetInsight[];
  readonly recentTransactions: readonly TransactionInsight[];
}

const RECENT_TRANSACTION_LIMIT = 80;

export function buildAnalysisContext(data: AppData, options: AnalysisOptions): AnalysisContext {
  const now = options.now ?? new Date();
  const report = buildReportIndex(data, { now, trendMonths: options.trendMonths });
  const budget = resolveAiModelCapabilities(options.settings).contextBudget.inputTokens;
  const period = analysisPeriod(options.analysisScope ?? "current-month", now);
  const entries = report.entries.filter((entry) => entry.occurredAt >= period.startAt && entry.occurredAt < period.endAt);
  const base = analysisBase(data, report, entries, period);
  const recent = recentTransactions(data.transactions, period);
  const selected = fitItems(base, recent.slice(0, RECENT_TRANSACTION_LIMIT), budget);
  const context = { ...base, recentTransactions: selected };
  return {
    ...context,
    contextMeta: {
      tokenBudget: budget,
      estimatedTokens: estimateTokens(context),
      truncated: selected.length < Math.min(recent.length, RECENT_TRANSACTION_LIMIT),
      recentTransactionCount: selected.length,
    },
  };
}

export function analysisScopeLabel(scope: AnalysisScope): string {
  if (scope === "last-3-months") return "近 3 个月";
  if (scope === "last-6-months") return "近 6 个月";
  if (scope === "year-to-date") return "今年";
  return "本月";
}

function analysisBase(
  data: AppData,
  report: ReturnType<typeof buildReportIndex>,
  entries: readonly ReportEntry[],
  period: AnalysisPeriod,
): AnalysisContext {
  return {
    contextMeta: { tokenBudget: 0, estimatedTokens: 0, truncated: false },
    period,
    ledger: {
      transactionCount: data.transactions.length,
      accountCount: data.accounts.length,
      currencies: data.currencies,
      reportingRules: [
        "退款在报表中以负支出抵扣原支出，不应改记为收入。",
        "信用卡消费在账期结算后按结算金额进入支出统计。",
        "currencySummary 是币种汇总，不是账户汇总。",
      ],
    },
    selectedRange: {
      entryCount: entries.length,
      currencySummary: summarizeByCurrency(entries),
      categorySummary: summarizeByCategory(data, entries),
      tagSummary: summarizeByTag(data, entries),
    },
    monthlyTrends: report.monthlyTrends,
    budgets: budgetInsights(data, entries),
    recentTransactions: [],
  };
}

function fitItems(
  base: AnalysisContext,
  transactions: readonly TransactionInsight[],
  budget: number,
): readonly TransactionInsight[] {
  const selected: TransactionInsight[] = [];
  for (const transaction of transactions) {
    const next = [...selected, transaction];
    if (estimateTokens({ ...base, recentTransactions: next }) > budget) break;
    selected.push(transaction);
  }
  if (selected.length === 0 && estimateTokens(base) > budget) {
    throw new Error("AI 上下文预算过小，无法包含必要账本上下文");
  }
  return selected;
}

function budgetInsights(data: AppData, entries: readonly ReportEntry[]): readonly BudgetInsight[] {
  return data.budgets.map((budget) => ({
    id: budget.id,
    name: budget.name,
    amount: budget.amount,
    currency: budget.currency,
    period: budget.period,
    spent: entries.filter((entry) => matchesBudget(entry, budget)).reduce((sum, entry) => sum + entry.amount, 0),
  }));
}

function matchesBudget(entry: ReportEntry, budget: Budget): boolean {
  const category = budget.categoryIds.length === 0 || budget.categoryIds.includes(entry.categoryId ?? "");
  const tag = budget.tagIds.length === 0 || budget.tagIds.some((tagId) => entry.tagIds.includes(tagId));
  return entry.kind === "expense" && category && tag && entry.currency === budget.currency;
}

function recentTransactions(
  transactions: readonly Transaction[],
  period: AnalysisPeriod,
): readonly TransactionInsight[] {
  return transactions
    .filter((transaction) => transaction.occurredAt >= period.startAt && transaction.occurredAt < period.endAt)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .map(({ kind, amount, currency, occurredAt, categoryId, tagIds, note }) => ({
      kind,
      amount,
      currency,
      occurredAt,
      categoryId,
      tagIds,
      note,
    }));
}

function analysisPeriod(scope: AnalysisScope, now: Date): AnalysisPeriod {
  if (scope === "year-to-date") {
    return {
      label: analysisScopeLabel(scope),
      startAt: new Date(now.getFullYear(), 0, 1).toISOString(),
      endAt: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  }
  const months = scope === "last-3-months" ? 3 : scope === "last-6-months" ? 6 : 1;
  return {
    label: analysisScopeLabel(scope),
    startAt: new Date(now.getFullYear(), now.getMonth() - months + 1, 1).toISOString(),
    endAt: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  };
}
