import { reportEntries } from "./analytics";
import type { ReportEntry } from "./analytics";
import { DAY_MAX, DAY_MIN } from "./constants";
import { bumpVersion, createId, nowIso, touchEntity } from "./factory";
import { accountCurrencyOptions } from "./recurring";
import { statementAccountIds, statementAdjustments, statementBillingAmounts } from "./statements";
import type {
  Account,
  AppData,
  Budget,
  Category,
  CreditCardStatement,
  CurrencyCode,
  EntityBase,
  Transaction,
  TransactionDraft,
} from "./types";

type CollectionKey = "accounts" | "categories" | "tags" | "budgets" | "recurringRules" | "statements";
type EntityFor<K extends CollectionKey> = AppData[K][number];

export interface TransactionFilter {
  readonly query?: string;
  readonly accountId?: string;
  readonly currency?: string;
  readonly categoryId?: string;
  readonly tagIds?: readonly string[];
  readonly kind?: string;
  readonly startAt?: string;
  readonly endAt?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function createBase(): EntityBase {
  const timestamp = nowIso();
  return { id: createId(), createdAt: timestamp, updatedAt: timestamp };
}

export function upsertEntity<K extends CollectionKey>(
  data: AppData,
  key: K,
  entity: EntityFor<K>,
): AppData {
  const collection = data[key] as readonly EntityFor<K>[];
  const exists = collection.some((item) => item.id === entity.id);
  const nextEntity = exists ? touchEntity(entity) : entity;
  const updated = exists ? collection.map((item) => item.id === entity.id ? nextEntity : item) : [...collection, entity];
  return bumpVersion({ ...data, [key]: updated });
}

export function deleteEntity(data: AppData, key: CollectionKey, id: string): AppData {
  assertCanDelete(data, key, id);
  return bumpVersion({ ...data, [key]: data[key].filter((item) => item.id !== id) });
}

export function upsertTransaction(data: AppData, transaction: Transaction): AppData {
  assertValidTransactionDraft(data, transaction);
  const exists = data.transactions.some((item) => item.id === transaction.id);
  const nextTransaction = exists ? touchEntity(transaction) : transaction;
  const transactions = exists
    ? data.transactions.map((item) => item.id === transaction.id ? nextTransaction : item)
    : [...data.transactions, transaction];
  return bumpVersion({ ...data, transactions });
}

export function deleteTransaction(data: AppData, id: string): AppData {
  return bumpVersion({ ...data, transactions: data.transactions.filter((item) => item.id !== id) });
}

export function addCurrency(data: AppData, currency: CurrencyCode): AppData {
  const normalized = normalizeCurrency(currency);
  if (!normalized) {
    throw new Error("币种代码不能为空");
  }
  if (data.currencies.includes(normalized)) {
    throw new Error("币种已存在");
  }
  return bumpVersion({ ...data, currencies: [...data.currencies, normalized] });
}

export function deleteCurrency(data: AppData, currency: CurrencyCode): AppData {
  if (currencyReferenceCount(data, currency) > 0) {
    throw new Error("无法删除：仍有数据引用该币种");
  }
  return bumpVersion({ ...data, currencies: data.currencies.filter((item) => item !== currency) });
}

export function validateTransactionDraft(data: AppData, draft: TransactionDraft): ValidationResult {
  const errors = [
    ...validateAmount(draft),
    ...validateDate(draft.occurredAt),
    ...validateAccount(data, draft.accountId),
    ...validateCurrency(data, draft.accountId, draft.currency, "交易币种与账户不匹配"),
    ...validateCategory(data.categories, draft),
    ...validateTransfer(data, draft),
    ...validateCreditPayment(data, draft),
  ];
  return { valid: errors.length === 0, errors };
}

export function assertValidTransactionDraft(data: AppData, draft: TransactionDraft): void {
  const result = validateTransactionDraft(data, draft);
  if (!result.valid) {
    throw new Error(result.errors.join("；"));
  }
}

export function filterTransactions(
  transactions: readonly Transaction[],
  filter: TransactionFilter,
): readonly Transaction[] {
  return transactions.filter((transaction) => matchesFilter(transaction, filter));
}

export function budgetPeriodRange(budget: Budget, now = new Date()): readonly [string, string] {
  const start = budget.period === "monthly"
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : new Date(now.getFullYear(), 0, 1);
  const end = budget.period === "monthly"
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : new Date(now.getFullYear() + 1, 0, 1);
  return [start.toISOString(), end.toISOString()];
}

export function spendingForBudgetPeriod(data: AppData, budget: Budget, now = new Date()): number {
  return spendingForBudgetPeriodEntries(reportEntries(data), budget, now);
}

export function spendingForBudgetPeriodEntries(
  entries: readonly ReportEntry[],
  budget: Budget,
  now = new Date(),
): number {
  const [start, end] = budgetPeriodRange(budget, now);
  return entries
    .filter((entry) => matchesBudgetPeriod(entry, budget, start, end))
    .reduce((total, entry) => total + entry.amount, 0);
}

export function foreignBudgetSpending(data: AppData, budget: Budget): readonly ReportEntry[] {
  return foreignBudgetSpendingEntries(reportEntries(data), budget);
}

export function foreignBudgetSpendingEntries(
  entries: readonly ReportEntry[],
  budget: Budget,
): readonly ReportEntry[] {
  const [start, end] = budgetPeriodRange(budget);
  return entries.filter((entry) => {
    return matchesBudgetScope(entry, budget) && entry.currency !== budget.currency
      && entry.occurredAt >= start && entry.occurredAt < end;
  });
}

export function generateStatementForAccount(account: Account, monthDate = new Date()): CreditCardStatement {
  if (account.kind !== "credit" || !account.statementDay) {
    throw new Error("只有配置账单日的信用卡账户可以生成账期");
  }
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, account.statementDay + 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth(), account.statementDay, 23, 59, 59);
  return { ...createBase(), accountId: account.id, startAt: start.toISOString(), endAt: end.toISOString(), primaryCurrency: account.currency, paid: false };
}

export function generateCombinedStatementForAccounts(accounts: readonly Account[], monthDate = new Date()): CreditCardStatement {
  if (accounts.length < 2) {
    throw new Error("合并账单至少需要选择 2 张信用卡");
  }
  const [primary, ...rest] = accounts;
  if (!primary || accounts.some((account) => account.kind !== "credit" || !account.statementDay)) {
    throw new Error("只有配置账单日的信用卡账户可以生成合并账单");
  }
  if (rest.some((account) => account.statementDay !== primary.statementDay)) {
    throw new Error("合并账单要求所选信用卡账单日一致");
  }
  return {
    ...generateStatementForAccount(primary, monthDate),
    accountIds: accounts.map((account) => account.id),
  };
}

export function createStatementForAccount(data: AppData, account: Account, monthDate = new Date()): AppData {
  const statement = generateStatementForAccount(account, monthDate);
  if (hasOverlappingStatement(data.statements, statement)) {
    throw new Error("该信用卡本周期账期已存在");
  }
  return upsertEntity(data, "statements", statement);
}

export function createCombinedStatementForAccounts(data: AppData, accounts: readonly Account[], monthDate = new Date()): AppData {
  const statement = generateCombinedStatementForAccounts(accounts, monthDate);
  if (hasOverlappingStatement(data.statements, statement)) {
    throw new Error("所选信用卡本周期账期已存在");
  }
  return upsertEntity(data, "statements", statement);
}

function assertCanDelete(data: AppData, key: CollectionKey, id: string): void {
  const count = referenceCount(data, key, id);
  if (count > 0) {
    throw new Error(`无法删除：仍有 ${count} 条数据引用该项目`);
  }
}

function referenceCount(data: AppData, key: CollectionKey, id: string): number {
  if (key === "accounts") {
    return data.transactions.filter((item) => item.accountId === id || item.relatedAccountId === id).length
      + data.statements.filter((statement) => statementAccountIds(statement).includes(id) || statement.settlementAccountId === id).length;
  }
  if (key === "categories") return data.transactions.filter((item) => item.categoryId === id).length;
  if (key === "tags") return data.transactions.filter((item) => item.tagIds.includes(id)).length;
  if (key === "budgets") return 0;
  if (key === "recurringRules") return data.transactions.filter((item) => item.sourceRecurringRuleId === id).length;
  return data.transactions.filter((item) => item.statementId === id || item.refundOfTransactionId === id).length;
}

function hasOverlappingStatement(statements: readonly CreditCardStatement[], statement: CreditCardStatement): boolean {
  const accountIds = new Set(statementAccountIds(statement));
  return statements.some((item) => {
    return item.startAt === statement.startAt
      && item.endAt === statement.endAt
      && statementAccountIds(item).some((accountId) => accountIds.has(accountId));
  });
}

function matchesFilter(transaction: Transaction, filter: TransactionFilter): boolean {
  if (filter.query && !transaction.note.includes(filter.query)) return false;
  if (filter.accountId && transaction.accountId !== filter.accountId) return false;
  if (filter.currency && transaction.currency !== filter.currency) return false;
  if (filter.categoryId && transaction.categoryId !== filter.categoryId) return false;
  if (filter.tagIds?.length && !filter.tagIds.some((tagId) => transaction.tagIds.includes(tagId))) return false;
  if (filter.kind && transaction.kind !== filter.kind) return false;
  if (filter.startAt && transaction.occurredAt < filter.startAt) return false;
  if (filter.endAt && transaction.occurredAt > filter.endAt) return false;
  return true;
}

function matchesBudgetPeriod(
  transaction: Transaction | ReportEntry,
  budget: Budget,
  start: string,
  end: string,
): boolean {
  return matchesBudgetScope(transaction, budget) && transaction.currency === budget.currency
    && transaction.occurredAt >= start && transaction.occurredAt < end;
}

function matchesBudgetScope(
  transaction: Transaction | ReportEntry,
  budget: Budget,
): boolean {
  const categoryOk = budget.categoryIds.length === 0 || budget.categoryIds.includes(transaction.categoryId ?? "");
  const tagOk = budget.tagIds.length === 0 || budget.tagIds.some((tagId) => transaction.tagIds.includes(tagId));
  return transaction.kind === "expense" && categoryOk && tagOk;
}

export function validStatementDay(value?: number): boolean {
  return value === undefined || (Number.isInteger(value) && value >= DAY_MIN && value <= DAY_MAX);
}

function currencyReferenceCount(data: AppData, currency: CurrencyCode): number {
  return data.accounts.filter((item) => accountUsesCurrency(item, currency)).length
    + data.transactions.filter((item) => item.currency === currency || item.targetCurrency === currency).length
    + data.budgets.filter((item) => item.currency === currency).length
    + data.statements.filter((item) => item.primaryCurrency === currency || item.settlementCurrency === currency || statementAdjustments(item).some((adjustment) => adjustment.currency === currency) || statementBillingAmounts(item).some((amount) => amount.currency === currency)).length
    + data.recurringRules.filter((item) => item.transaction.currency === currency || item.transaction.targetCurrency === currency).length;
}

function accountUsesCurrency(account: Account, currency: CurrencyCode): boolean {
  return account.currency === currency || Boolean(account.currencyCodes?.includes(currency));
}

function normalizeCurrency(currency: CurrencyCode): CurrencyCode {
  return currency.trim().toUpperCase();
}

function validateAmount(draft: TransactionDraft): readonly string[] {
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    return ["金额必须大于 0"];
  }
  if (draft.kind !== "transfer") {
    return [];
  }
  if (!Number.isFinite(draft.targetAmount) || (draft.targetAmount ?? 0) <= 0) {
    return ["转入金额必须大于 0"];
  }
  return [];
}

function validateDate(value: string): readonly string[] {
  return Number.isNaN(new Date(value).getTime()) ? ["日期无效"] : [];
}

function validateAccount(data: AppData, accountId: string): readonly string[] {
  return data.accounts.some((account) => account.id === accountId) ? [] : ["账户不存在"];
}

function validateCurrency(
  data: AppData,
  accountId: string,
  currency: CurrencyCode | undefined,
  message: string,
): readonly string[] {
  const account = data.accounts.find((item) => item.id === accountId);
  if (!account || !currency) {
    return [];
  }
  return accountCurrencyOptions(account).includes(currency) ? [] : [message];
}

function validateCategory(categories: readonly Category[], draft: TransactionDraft): readonly string[] {
  if (!draft.categoryId || draft.kind === "transfer") {
    return [];
  }
  const category = categories.find((item) => item.id === draft.categoryId);
  if (!category) {
    return ["分类不存在"];
  }
  const direction = draft.kind === "refund" ? "expense" : draft.kind;
  if ((direction === "income" || direction === "expense") && category.direction !== direction) {
    return ["分类方向与交易类型不匹配"];
  }
  return [];
}

function validateTransfer(data: AppData, draft: TransactionDraft): readonly string[] {
  if (draft.kind !== "transfer") {
    return [];
  }
  if (!draft.relatedAccountId) {
    return ["转账必须选择目标账户"];
  }
  if (draft.relatedAccountId === draft.accountId) {
    return ["目标账户不能与源账户相同"];
  }
  if (!data.accounts.some((account) => account.id === draft.relatedAccountId)) {
    return ["目标账户不存在"];
  }
  return validateCurrency(data, draft.relatedAccountId, draft.targetCurrency, "转入币种与目标账户不匹配");
}

function validateCreditPayment(data: AppData, draft: TransactionDraft): readonly string[] {
  if (draft.kind !== "credit_payment") {
    return [];
  }
  const account = data.accounts.find((item) => item.id === draft.accountId);
  if (account?.kind !== "credit") {
    return ["还款目标必须是信用卡账户"];
  }
  if (!draft.relatedAccountId) {
    return [];
  }
  if (draft.relatedAccountId === draft.accountId) {
    return ["还款来源账户不能是当前信用卡账户"];
  }
  return data.accounts.some((item) => item.id === draft.relatedAccountId) ? [] : ["还款来源账户不存在"];
}
