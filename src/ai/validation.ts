import { TRANSACTION_KINDS } from "../domain/constants";
import type { AppData, TransactionDraft, TransactionKind } from "../domain/types";
import dayjs from "dayjs";

export interface CandidateValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly draft?: TransactionDraft;
}

export interface CategoryTagSuggestion {
  readonly categoryId?: string;
  readonly tagIds: readonly string[];
  readonly confidence: number;
}

export interface SuggestionValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly suggestion?: CategoryTagSuggestion;
}

export function validateTransactionDraft(value: unknown, data: AppData): CandidateValidation {
  const errors: string[] = [];
  const raw = value as Record<string, unknown>;
  const kind = normalizeKind(raw.kind);
  const amount = Number(raw.amount);
  const currency = normalizeCurrency(raw.currency, data);
  const accountId = matchId(raw.accountId ?? raw.account, data.accounts);
  const categoryId = matchOptionalId(raw.categoryId ?? raw.category, data.categories);
  const tagIds = normalizeTags(raw.tagIds ?? raw.tags, data);
  const occurredAt = normalizeDate(raw.occurredAt ?? raw.date);
  if (!kind) errors.push("AI 返回的交易类型无法匹配现有类型");
  if (!Number.isFinite(amount) || amount <= 0) errors.push("金额必须大于 0");
  if (!currency) errors.push("AI 返回的币种不在当前账本中");
  if (!accountId) errors.push("AI 返回的账户无法匹配当前账本");
  if (categoryId === null) errors.push("AI 返回的分类无法匹配当前账本");
  if (tagIds === null) errors.push("AI 返回的标签无法匹配当前账本");
  if (!occurredAt) errors.push("AI 返回的日期无法解析");
  if (errors.length > 0) return { valid: false, errors };
  if (!kind || !accountId || !currency || !occurredAt || categoryId === null || tagIds === null) {
    return { valid: false, errors };
  }
  return {
    valid: true,
    errors: [],
    draft: {
      kind,
      accountId,
      amount,
      currency,
      occurredAt,
      categoryId: categoryId ?? undefined,
      tagIds,
      note: typeof raw.note === "string" ? raw.note : "",
      relatedAccountId: matchOptionalId(raw.relatedAccountId, data.accounts) ?? undefined,
    },
  };
}

export function validateTransactionDrafts(value: unknown, data: AppData): readonly CandidateValidation[] {
  if (!Array.isArray(value)) {
    return [{ valid: false, errors: ["AI 未返回交易数组"] }];
  }
  return value.map((item) => validateTransactionDraft(item, data));
}

export function validateCategoryTagSuggestion(value: unknown, data: AppData, draft: TransactionDraft): SuggestionValidation {
  const errors: string[] = [];
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const categoryId = matchOptionalId(raw.categoryId ?? raw.category, data.categories);
  const tagIds = normalizeTags(raw.tagIds ?? raw.tags, data);
  if (categoryId === null) errors.push("AI 建议的分类无法匹配当前账本");
  if (tagIds === null) errors.push("AI 建议的标签无法匹配当前账本");
  if (typeof categoryId === "string" && !categoryMatchesDraft(data, draft, categoryId)) {
    errors.push("AI 建议的分类方向与交易类型不匹配");
  }
  if (errors.length > 0 || categoryId === null || tagIds === null) {
    return { valid: false, errors };
  }
  return {
    valid: true,
    errors: [],
    suggestion: {
      categoryId: categoryId ?? undefined,
      tagIds,
      confidence: normalizeConfidence(raw.confidence),
    },
  };
}

function normalizeKind(value: unknown): TransactionKind | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (TRANSACTION_KINDS.includes(normalized as TransactionKind)) return normalized as TransactionKind;
  return kindMap()[value.trim()];
}

function kindMap(): Record<string, TransactionKind> {
  return { 收入: "income", 支出: "expense", 消费: "expense", 退款: "refund", 转账: "transfer", 还款: "credit_payment" };
}

function normalizeCurrency(value: unknown, data: AppData): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return data.currencies.includes(normalized) ? normalized : undefined;
}

function matchId(value: unknown, items: readonly { readonly id: string; readonly name: string }[]): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return items.find((item) => item.id === text || item.name === text)?.id;
}

function matchOptionalId(value: unknown, items: readonly { readonly id: string; readonly name: string }[]): string | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return matchId(value, items) ?? null;
}

function normalizeTags(value: unknown, data: AppData): readonly string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const tags = value.map((item) => matchId(item, data.tags));
  return tags.every(Boolean) ? tags as readonly string[] : null;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const dateOnly = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (dateOnly) return dateOnly;
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DD") : undefined;
}

function normalizeConfidence(value: unknown): number {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0.5;
  return Math.min(1, Math.max(0, confidence));
}

function categoryMatchesDraft(data: AppData, draft: TransactionDraft, categoryId: string): boolean {
  const category = data.categories.find((item) => item.id === categoryId);
  if (!category) return false;
  if (draft.kind === "income") return category.direction === "income";
  if (draft.kind === "expense" || draft.kind === "refund") return category.direction === "expense";
  return false;
}
