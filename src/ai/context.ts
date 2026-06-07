import { TRANSACTION_KINDS } from "../domain/constants";
import { buildReportIndex, summarizeByCategory, summarizeByCurrency, summarizeByTag, type ReportEntry } from "../domain/analytics";
import type { Account, AiSettings, AppData, Budget, Category, Tag, Transaction } from "../domain/types";
import { resolveAiModelCapabilities } from "./modelCapabilities";

export interface ContextMeta {
  readonly tokenBudget: number;
  readonly estimatedTokens: number;
  readonly truncated: boolean;
  readonly categoryCount?: number;
  readonly tagCount?: number;
  readonly recentTransactionCount?: number;
}

export interface DraftContext {
  readonly contextMeta: ContextMeta;
  readonly currentDate: string;
  readonly transactionKinds: readonly string[];
  readonly currencies: readonly string[];
  readonly accounts: readonly Pick<Account, "id" | "name" | "kind" | "currency" | "currencyCodes">[];
  readonly categories: readonly Pick<Category, "id" | "name" | "direction">[];
  readonly tags: readonly Pick<Tag, "id" | "name">[];
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

export interface SuggestionContext {
  readonly contextMeta: ContextMeta;
  readonly currentDate: string;
  readonly transactionKinds: readonly string[];
  readonly categories: readonly Pick<Category, "id" | "name" | "direction">[];
  readonly tags: readonly Pick<Tag, "id" | "name">[];
}

export interface QueryContext {
  readonly contextMeta: ContextMeta;
  readonly currentDate: string;
  readonly question: string;
  readonly ledger: {
    readonly transactionCount: number;
    readonly accountCount: number;
    readonly currencies: readonly string[];
  };
  readonly catalog: {
    readonly accounts: readonly Pick<Account, "id" | "name" | "kind" | "currency" | "currencyCodes">[];
    readonly categories: readonly Pick<Category, "id" | "name" | "direction">[];
    readonly tags: readonly Pick<Tag, "id" | "name">[];
  };
  readonly currentMonth: {
    readonly currencySummary: unknown;
    readonly categorySummary: unknown;
    readonly tagSummary: unknown;
  };
  readonly monthlyTrends: unknown;
  readonly budgets: readonly BudgetInsight[];
  readonly recentTransactions: readonly QueryTransactionInsight[];
}

export interface AnalysisPromptContext {
  readonly label: string;
}

interface ContextOptions {
  readonly settings: AiSettings;
  readonly now?: Date;
  readonly input?: string;
  readonly mode?: DraftMode;
  readonly trendMonths?: number;
  readonly analysisScope?: AnalysisScope;
}

export type AnalysisScope = "current-month" | "last-3-months" | "last-6-months" | "year-to-date";
export type DraftMode = "single" | "batch";

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

interface QueryTransactionInsight extends TransactionInsight {
  readonly accountId: string;
}

const TOKEN_CHAR_RATIO = 4;
const RECENT_TRANSACTION_LIMIT = 80;

export function buildDraftContext(data: AppData, options: ContextOptions): DraftContext {
  const now = options.now ?? new Date();
  const budget = resolveAiModelCapabilities(options.settings).contextBudget.inputTokens;
  const base = draftBase(data, now);
  const categoryPool = rankCategories(data);
  const tagPool = rankTags(data);
  return fitDraftContext(base, categoryPool, tagPool, budget);
}

export function buildAnalysisContext(data: AppData, options: ContextOptions): AnalysisContext {
  const now = options.now ?? new Date();
  const report = buildReportIndex(data, { now, trendMonths: options.trendMonths });
  const budget = resolveAiModelCapabilities(options.settings).contextBudget.inputTokens;
  const period = analysisPeriod(options.analysisScope ?? "current-month", now);
  const entries = scopedEntries(report.entries, period);
  const base = analysisBase(data, report, entries, period);
  return fitAnalysisContext(base, recentTransactions(data.transactions, period), budget);
}

export function buildSuggestionContext(data: AppData, options: ContextOptions): SuggestionContext {
  const now = options.now ?? new Date();
  const budget = resolveAiModelCapabilities(options.settings).contextBudget.inputTokens;
  const base: SuggestionContext = {
    contextMeta: { tokenBudget: 0, estimatedTokens: 0, truncated: false },
    currentDate: now.toISOString(),
    transactionKinds: TRANSACTION_KINDS,
    categories: [],
    tags: [],
  };
  return fitSuggestionContext(base, rankCategories(data), rankTags(data), budget);
}

export function buildQueryContext(data: AppData, question: string, options: ContextOptions): QueryContext {
  const now = options.now ?? new Date();
  const budget = resolveAiModelCapabilities(options.settings).contextBudget.inputTokens;
  const report = buildReportIndex(data, { now, trendMonths: options.trendMonths ?? 6 });
  const base: QueryContext = {
    contextMeta: { tokenBudget: 0, estimatedTokens: 0, truncated: false },
    currentDate: now.toISOString(),
    question,
    ledger: {
      transactionCount: data.transactions.length,
      accountCount: data.accounts.length,
      currencies: data.currencies,
    },
    catalog: {
      accounts: data.accounts.map(accountContext),
      categories: [],
      tags: [],
    },
    currentMonth: {
      currencySummary: report.currencySummary,
      categorySummary: report.categorySummary,
      tagSummary: report.tagSummary,
    },
    monthlyTrends: report.monthlyTrends,
    budgets: budgetInsights(data, report.currentMonthEntries),
    recentTransactions: [],
  };
  return fitQueryContext(base, rankCategories(data), rankTags(data), queryTransactions(data.transactions), budget);
}

export function analysisScopeLabel(scope: AnalysisScope): string {
  if (scope === "last-3-months") return "近 3 个月";
  if (scope === "last-6-months") return "近 6 个月";
  if (scope === "year-to-date") return "今年";
  return "本月";
}

export function buildDraftSystemPrompt(
  data: AppData,
  options: ContextOptions,
): { readonly role: "system"; readonly content: string } {
  return {
    role: "system",
    content: draftInstructions(buildDraftContext(data, options), options.mode ?? "single"),
  };
}

export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / TOKEN_CHAR_RATIO);
}

function draftBase(data: AppData, now: Date): DraftContext {
  return {
    contextMeta: { tokenBudget: 0, estimatedTokens: 0, truncated: false },
    currentDate: now.toISOString(),
    transactionKinds: TRANSACTION_KINDS,
    currencies: data.currencies,
    accounts: data.accounts.map(accountContext),
    categories: [],
    tags: [],
  };
}

function fitDraftContext(
  base: DraftContext,
  categories: readonly DraftContext["categories"][number][],
  tags: readonly DraftContext["tags"][number][],
  budget: number,
): DraftContext {
  const selectedCategories = fitItems(base, categories, budget, (items) => ({ ...base, categories: items }));
  const withCategories = { ...base, categories: selectedCategories };
  const selectedTags = fitItems(withCategories, tags, budget, (items) => ({ ...withCategories, tags: items }));
  const result = { ...withCategories, tags: selectedTags };
  return withDraftMeta(result, budget, categories.length, tags.length);
}

function fitItems<T>(base: unknown, items: readonly T[], budget: number, build: (items: readonly T[]) => unknown): readonly T[] {
  const selected: T[] = [];
  for (const item of items) {
    const next = [...selected, item];
    if (estimateTokens(build(next)) > budget) break;
    selected.push(item);
  }
  if (selected.length === 0 && estimateTokens(base) > budget) {
    throw new Error("AI 上下文预算过小，无法包含必要账本上下文");
  }
  return selected;
}

function withDraftMeta(context: DraftContext, budget: number, categoryCount: number, tagCount: number): DraftContext {
  const estimatedTokens = estimateTokens(context);
  return {
    ...context,
    contextMeta: {
      tokenBudget: budget,
      estimatedTokens,
      truncated: context.categories.length < categoryCount || context.tags.length < tagCount,
      categoryCount: context.categories.length,
      tagCount: context.tags.length,
    },
  };
}

function fitSuggestionContext(
  base: SuggestionContext,
  categories: readonly SuggestionContext["categories"][number][],
  tags: readonly SuggestionContext["tags"][number][],
  budget: number,
): SuggestionContext {
  const selectedCategories = fitItems(base, categories, budget, (items) => ({ ...base, categories: items }));
  const withCategories = { ...base, categories: selectedCategories };
  const selectedTags = fitItems(withCategories, tags, budget, (items) => ({ ...withCategories, tags: items }));
  const result = { ...withCategories, tags: selectedTags };
  return {
    ...result,
    contextMeta: {
      tokenBudget: budget,
      estimatedTokens: estimateTokens(result),
      truncated: result.categories.length < categories.length || result.tags.length < tags.length,
      categoryCount: result.categories.length,
      tagCount: result.tags.length,
    },
  };
}

function fitQueryContext(
  base: QueryContext,
  categories: readonly QueryContext["catalog"]["categories"][number][],
  tags: readonly QueryContext["catalog"]["tags"][number][],
  transactions: readonly QueryTransactionInsight[],
  budget: number,
): QueryContext {
  const selectedCategories = fitItems(base, categories, budget, (items) => ({ ...base, catalog: { ...base.catalog, categories: items } }));
  const withCategories = { ...base, catalog: { ...base.catalog, categories: selectedCategories } };
  const selectedTags = fitItems(withCategories, tags, budget, (items) => ({ ...withCategories, catalog: { ...withCategories.catalog, tags: items } }));
  const withTags = { ...withCategories, catalog: { ...withCategories.catalog, tags: selectedTags } };
  const selectedTransactions = fitItems(withTags, transactions, budget, (items) => ({ ...withTags, recentTransactions: items }));
  const result = { ...withTags, recentTransactions: selectedTransactions };
  return {
    ...result,
    contextMeta: {
      tokenBudget: budget,
      estimatedTokens: estimateTokens(result),
      truncated: result.catalog.categories.length < categories.length || result.catalog.tags.length < tags.length || result.recentTransactions.length < transactions.length,
      categoryCount: result.catalog.categories.length,
      tagCount: result.catalog.tags.length,
      recentTransactionCount: result.recentTransactions.length,
    },
  };
}

function draftInstructions(context: DraftContext, mode: DraftMode): string {
  const outputRules = mode === "batch"
    ? [
      "你是 Coinly 的批量记账解析器。只输出一个合法 JSON 数组，不要 Markdown，不要解释。",
      "数组中的每个元素都必须符合 TransactionDraft：kind, accountId, amount, currency, occurredAt, tagIds, note 为必填字段。",
      "只解析用户明确提供的交易，不要补造或推断不存在的交易。",
    ]
    : [
      "你是 Coinly 的记账解析器。只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
      "JSON 必须符合 TransactionDraft：kind, accountId, amount, currency, occurredAt, tagIds, note 为必填字段。",
    ];
  return [
    ...outputRules,
    "kind 只能从这些枚举中选择。不要输出中文类型，不要发明新类型。",
    "常见映射：消费/付款/买东西=expense，工资/收款=income，退款/退货=refund，转账=transfer，信用卡还款=credit_payment。",
    "accountId 必须使用上下文账户 id；categoryId 必须使用候选分类 id；tagIds 必须是标签 id 数组。",
    "候选分类和标签可能因上下文预算被裁剪。无法确定分类或标签时省略 categoryId 或输出空 tagIds。",
    "currency 必须使用账本币种代码；occurredAt 只输出日期，不要输出具体时间；amount 必须是正数。",
    `上下文：${JSON.stringify(context)}`,
  ].join("\n");
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
        "这些规则只用于理解数据，不应在报告中复述。",
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

function fitAnalysisContext(
  base: AnalysisContext,
  transactions: readonly TransactionInsight[],
  budget: number,
): AnalysisContext {
  const selected = fitItems(base, transactions.slice(0, RECENT_TRANSACTION_LIMIT), budget, (items) => ({
    ...base,
    recentTransactions: items,
  }));
  const result = { ...base, recentTransactions: selected };
  return withAnalysisMeta(result, budget, transactions.length);
}

function withAnalysisMeta(context: AnalysisContext, budget: number, totalRecent: number): AnalysisContext {
  return {
    ...context,
    contextMeta: {
      tokenBudget: budget,
      estimatedTokens: estimateTokens(context),
      truncated: context.recentTransactions.length < Math.min(totalRecent, RECENT_TRANSACTION_LIMIT),
      recentTransactionCount: context.recentTransactions.length,
    },
  };
}

function rankCategories(data: AppData): readonly Pick<Category, "id" | "name" | "direction">[] {
  const scores = scoreById(data.transactions, (transaction) => transaction.categoryId);
  return data.categories.map((item) => ({ id: item.id, name: item.name, direction: item.direction }))
    .sort((left, right) => (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0));
}

function rankTags(data: AppData): readonly Pick<Tag, "id" | "name">[] {
  const scores = new Map<string, number>();
  for (const transaction of data.transactions) {
    for (const tagId of transaction.tagIds) scores.set(tagId, (scores.get(tagId) ?? 0) + 1);
  }
  return data.tags.map((item) => ({ id: item.id, name: item.name }))
    .sort((left, right) => (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0));
}

function scoreById(transactions: readonly Transaction[], select: (transaction: Transaction) => string | undefined): Map<string, number> {
  const scores = new Map<string, number>();
  for (const transaction of transactions) {
    const id = select(transaction);
    if (id) scores.set(id, (scores.get(id) ?? 0) + 1);
  }
  return scores;
}

function budgetInsights(data: AppData, entries: readonly ReportEntry[]): readonly BudgetInsight[] {
  return data.budgets.map((budget) => ({
    id: budget.id,
    name: budget.name,
    amount: budget.amount,
    currency: budget.currency,
    period: budget.period,
    spent: spendingForBudget(entries, budget),
  }));
}

function spendingForBudget(entries: readonly ReportEntry[], budget: Budget): number {
  return entries.filter((entry) => matchesBudget(entry, budget)).reduce((sum, entry) => sum + entry.amount, 0);
}

function matchesBudget(entry: ReportEntry, budget: Budget): boolean {
  const category = budget.categoryIds.length === 0 || budget.categoryIds.includes(entry.categoryId ?? "");
  const tag = budget.tagIds.length === 0 || budget.tagIds.some((tagId) => entry.tagIds.includes(tagId));
  return entry.kind === "expense" && category && tag && entry.currency === budget.currency;
}

function recentTransactions(transactions: readonly Transaction[], period: AnalysisPeriod): readonly TransactionInsight[] {
  return transactions
    .filter((transaction) => transaction.occurredAt >= period.startAt && transaction.occurredAt < period.endAt)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .map(transactionInsight);
}

function transactionInsight(transaction: Transaction): TransactionInsight {
  return {
    kind: transaction.kind,
    amount: transaction.amount,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt,
    categoryId: transaction.categoryId,
    tagIds: transaction.tagIds,
    note: transaction.note,
  };
}

function queryTransactions(transactions: readonly Transaction[]): readonly QueryTransactionInsight[] {
  return [...transactions]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .map((transaction) => ({ ...transactionInsight(transaction), accountId: transaction.accountId }));
}

function accountContext(account: Account): DraftContext["accounts"][number] {
  return {
    id: account.id,
    name: account.name,
    kind: account.kind,
    currency: account.currency,
    currencyCodes: account.currencyCodes,
  };
}

function scopedEntries(entries: readonly ReportEntry[], period: AnalysisPeriod): readonly ReportEntry[] {
  return entries.filter((entry) => entry.occurredAt >= period.startAt && entry.occurredAt < period.endAt);
}

function analysisPeriod(scope: AnalysisScope, now: Date): AnalysisPeriod {
  if (scope === "last-3-months") return rollingMonthPeriod(analysisScopeLabel(scope), now, 3);
  if (scope === "last-6-months") return rollingMonthPeriod(analysisScopeLabel(scope), now, 6);
  if (scope === "year-to-date") return yearToDatePeriod(now);
  return rollingMonthPeriod(analysisScopeLabel(scope), now, 1);
}

function rollingMonthPeriod(label: string, now: Date, months: number): AnalysisPeriod {
  const startAt = new Date(now.getFullYear(), now.getMonth() - months + 1, 1).toISOString();
  const endAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { label, startAt, endAt };
}

function yearToDatePeriod(now: Date): AnalysisPeriod {
  const startAt = new Date(now.getFullYear(), 0, 1).toISOString();
  const endAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { label: analysisScopeLabel("year-to-date"), startAt, endAt };
}
