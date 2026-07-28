import { TRANSACTION_KINDS } from "../domain/constants";
import type { Account, AiModelSettings, AppData, Category, Tag, Transaction } from "../domain/types";
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

export interface SuggestionContext {
  readonly contextMeta: ContextMeta;
  readonly currentDate: string;
  readonly transactionKinds: readonly string[];
  readonly categories: readonly Pick<Category, "id" | "name" | "direction">[];
  readonly tags: readonly Pick<Tag, "id" | "name">[];
}

interface ContextOptions {
  readonly settings: AiModelSettings;
  readonly now?: Date;
  readonly input?: string;
  readonly mode?: DraftMode;
}

export type DraftMode = "single" | "batch";

const TOKEN_CHAR_RATIO = 4;

export function buildDraftContext(data: AppData, options: ContextOptions): DraftContext {
  const now = options.now ?? new Date();
  const budget = resolveAiModelCapabilities(options.settings).contextBudget.inputTokens;
  const base = draftBase(data, now);
  const categoryPool = rankCategories(data);
  const tagPool = rankTags(data);
  return fitDraftContext(base, categoryPool, tagPool, budget);
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

function accountContext(account: Account): DraftContext["accounts"][number] {
  return {
    id: account.id,
    name: account.name,
    kind: account.kind,
    currency: account.currency,
    currencyCodes: account.currencyCodes,
  };
}
