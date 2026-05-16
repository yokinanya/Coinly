import { DEFAULT_CURRENCIES } from "../domain/constants";
import { APP_SCHEMA_VERSION } from "../domain/factory";
import type { AppData, EntityBase } from "../domain/types";

export interface DataSummary {
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly localVersion: number;
  readonly currencies: number;
  readonly accounts: number;
  readonly categories: number;
  readonly tags: number;
  readonly transactions: number;
  readonly recurringRules: number;
  readonly budgets: number;
  readonly statements: number;
}

export interface ImportPreview {
  readonly data: AppData;
  readonly summary: DataSummary;
}

export function parseImportedData(value: string): AppData {
  return previewImportedData(value).data;
}

export function previewImportedData(value: string): ImportPreview {
  const data = JSON.parse(value) as AppData;
  if (!isValidImportedData(data)) {
    throw new Error("导入文件不是有效的 Coinly 数据");
  }
  const migrated = migrateData(data);
  assertValidAppData(migrated);
  return { data: migrated, summary: dataSummary(migrated) };
}

export function assertValidAppData(data: AppData): void {
  const errors = validationErrors(data);
  if (errors.length > 0) {
    throw new Error(`数据校验失败：${errors.join("；")}`);
  }
}

export function migrateData(data: AppData): AppData {
  return {
    ...data,
    schemaVersion: data.schemaVersion ?? APP_SCHEMA_VERSION,
    updatedAt: data.updatedAt ?? latestUpdatedAt(data),
    currencies: Array.isArray(data.currencies) ? data.currencies : DEFAULT_CURRENCIES,
    statements: migrateStatements(data),
    uiSettings: data.uiSettings ?? { theme: "system" },
  };
}

export function assertValidReferences(data: AppData): void {
  const errors = referenceErrors(data);
  if (errors.length > 0) throw new Error(`导入数据引用无效：${errors.join("；")}`);
}

export function dataSummary(data: AppData): DataSummary {
  return {
    schemaVersion: data.schemaVersion,
    updatedAt: data.updatedAt,
    localVersion: data.localVersion,
    currencies: data.currencies.length,
    accounts: data.accounts.length,
    categories: data.categories.length,
    tags: data.tags.length,
    transactions: data.transactions.length,
    recurringRules: data.recurringRules.length,
    budgets: data.budgets.length,
    statements: data.statements.length,
  };
}

function migrateStatements(data: AppData): AppData["statements"] {
  return data.statements.map((statement) => {
    const transaction = data.transactions.find((item) => item.id === statement.settlementTransactionId);
    if (!statement.paid || !transaction) return statement;
    return {
      ...statement,
      settledAt: statement.settledAt ?? transaction.occurredAt,
      settlementAccountId: statement.settlementAccountId ?? transaction.relatedAccountId,
      settlementAmount: statement.settlementAmount ?? transaction.amount,
      settlementCurrency: statement.settlementCurrency ?? transaction.currency,
    };
  });
}

function isValidImportedData(data: AppData): boolean {
  return typeof data === "object"
    && data !== null
    && (data.schemaVersion === undefined || data.schemaVersion === APP_SCHEMA_VERSION)
    && (!("updatedAt" in data) || typeof data.updatedAt === "string")
    && (!("currencies" in data) || Array.isArray(data.currencies))
    && Array.isArray(data.accounts)
    && Array.isArray(data.categories)
    && Array.isArray(data.tags)
    && Array.isArray(data.transactions)
    && Array.isArray(data.recurringRules)
    && Array.isArray(data.budgets)
    && Array.isArray(data.statements)
    && typeof data.localVersion === "number"
    && data.accounts.every(hasEntityBase)
    && data.categories.every(hasEntityBase)
    && data.tags.every(hasEntityBase)
    && data.transactions.every(hasEntityBase)
    && data.recurringRules.every(hasEntityBase)
    && data.budgets.every(hasEntityBase)
    && data.statements.every(hasEntityBase);
}

function latestUpdatedAt(data: AppData): string {
  const values = [
    ...data.accounts,
    ...data.categories,
    ...data.tags,
    ...data.transactions,
    ...data.recurringRules,
    ...data.budgets,
    ...data.statements,
  ].map((item) => item.updatedAt);
  return values.sort((left, right) => right.localeCompare(left))[0] ?? new Date(0).toISOString();
}

function hasEntityBase(value: EntityBase): boolean {
  return typeof value.id === "string"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string";
}

function referenceErrors(data: AppData): readonly string[] {
  const refs = referenceSets(data);
  return [
    ...accountReferenceErrors(data, refs),
    ...transactionReferenceErrors(data, refs),
    ...budgetReferenceErrors(data, refs),
    ...statementReferenceErrors(data, refs),
    ...recurringRuleReferenceErrors(data, refs),
  ];
}

function validationErrors(data: AppData): readonly string[] {
  return [
    ...duplicateEntityErrors(data),
    ...referenceErrors(data),
    ...transactionShapeErrors(data),
  ];
}

function duplicateEntityErrors(data: AppData): readonly string[] {
  const seen = new Set<string>();
  const duplicates = allEntities(data).filter((item) => seen.has(item.id) || !seen.add(item.id));
  return duplicates.map((item) => `重复实体 ID：${item.id}`);
}

function transactionShapeErrors(data: AppData): readonly string[] {
  return data.transactions.flatMap((transaction) => {
    const errors: string[] = [];
    if (!transaction.kind) errors.push(`交易 ${transaction.id} 缺少类型`);
    if (!transaction.accountId) errors.push(`交易 ${transaction.id} 缺少账户`);
    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) errors.push(`交易 ${transaction.id} 金额无效`);
    if (!transaction.occurredAt) errors.push(`交易 ${transaction.id} 缺少日期`);
    if (transaction.kind === "transfer" && !transaction.relatedAccountId) errors.push(`交易 ${transaction.id} 缺少目标账户`);
    if (transaction.kind === "credit_payment" && !data.accounts.some((account) => account.id === transaction.accountId && account.kind === "credit")) {
      errors.push(`交易 ${transaction.id} 的还款账户不是信用卡`);
    }
    return errors;
  });
}

function allEntities(data: AppData): readonly EntityBase[] {
  return [
    ...data.accounts,
    ...data.categories,
    ...data.tags,
    ...data.transactions,
    ...data.recurringRules,
    ...data.budgets,
    ...data.statements,
  ];
}

function referenceSets(data: AppData) {
  return {
    accounts: new Set(data.accounts.map((item) => item.id)),
    creditAccounts: new Set(data.accounts.filter((item) => item.kind === "credit").map((item) => item.id)),
    categories: new Set(data.categories.map((item) => item.id)),
    currencies: new Set(data.currencies),
    statements: new Set(data.statements.map((item) => item.id)),
    tags: new Set(data.tags.map((item) => item.id)),
    transactions: new Set(data.transactions.map((item) => item.id)),
  };
}

function accountReferenceErrors(data: AppData, refs: ReturnType<typeof referenceSets>): readonly string[] {
  return data.accounts.flatMap((account) => {
    const currencies = [account.currency, ...(account.currencyCodes ?? [])];
    return currencies.filter((currency) => !refs.currencies.has(currency))
      .map((currency) => `账户 ${account.id} 引用不存在的币种 ${currency}`);
  });
}

function transactionReferenceErrors(data: AppData, refs: ReturnType<typeof referenceSets>): readonly string[] {
  return data.transactions.flatMap((transaction) => [
    ...missingRef(refs.accounts, transaction.accountId, `交易 ${transaction.id} 引用不存在的账户 ${transaction.accountId}`),
    ...missingOptionalRef(refs.accounts, transaction.relatedAccountId, `交易 ${transaction.id} 引用不存在的关联账户 ${transaction.relatedAccountId}`),
    ...missingOptionalRef(refs.categories, transaction.categoryId, `交易 ${transaction.id} 引用不存在的分类 ${transaction.categoryId}`),
    ...missingOptionalRef(refs.statements, transaction.statementId, `交易 ${transaction.id} 引用不存在的账期 ${transaction.statementId}`),
    ...missingOptionalRef(refs.transactions, transaction.refundOfTransactionId, `交易 ${transaction.id} 引用不存在的原始退款交易 ${transaction.refundOfTransactionId}`),
    ...currencyErrors(refs, `交易 ${transaction.id}`, transaction.currency, transaction.targetCurrency),
    ...tagReferenceErrors(refs, `交易 ${transaction.id}`, transaction.tagIds),
  ]);
}

function budgetReferenceErrors(data: AppData, refs: ReturnType<typeof referenceSets>): readonly string[] {
  return data.budgets.flatMap((budget) => [
    ...currencyErrors(refs, `预算 ${budget.id}`, budget.currency),
    ...budget.categoryIds.flatMap((id) => missingRef(refs.categories, id, `预算 ${budget.id} 引用不存在的分类 ${id}`)),
    ...tagReferenceErrors(refs, `预算 ${budget.id}`, budget.tagIds),
  ]);
}

function statementReferenceErrors(data: AppData, refs: ReturnType<typeof referenceSets>): readonly string[] {
  return data.statements.flatMap((statement) => [
    ...missingCreditAccount(refs, statement.accountId, `账期 ${statement.id} 引用不存在的信用卡账户 ${statement.accountId}`),
    ...missingOptionalRef(refs.accounts, statement.settlementAccountId, `账期 ${statement.id} 引用不存在的结算账户 ${statement.settlementAccountId}`),
    ...missingOptionalRef(refs.transactions, statement.settlementTransactionId, `账期 ${statement.id} 引用不存在的结算交易 ${statement.settlementTransactionId}`),
    ...currencyErrors(refs, `账期 ${statement.id}`, statement.primaryCurrency, statement.settlementCurrency),
  ]);
}

function recurringRuleReferenceErrors(data: AppData, refs: ReturnType<typeof referenceSets>): readonly string[] {
  return data.recurringRules.flatMap((rule) => [
    ...missingRef(refs.accounts, rule.transaction.accountId, `订阅规则 ${rule.id} 引用不存在的账户 ${rule.transaction.accountId}`),
    ...missingOptionalRef(refs.accounts, rule.transaction.relatedAccountId, `订阅规则 ${rule.id} 引用不存在的关联账户 ${rule.transaction.relatedAccountId}`),
    ...missingOptionalRef(refs.categories, rule.transaction.categoryId, `订阅规则 ${rule.id} 引用不存在的分类 ${rule.transaction.categoryId}`),
    ...currencyErrors(refs, `订阅规则 ${rule.id}`, rule.transaction.currency, rule.transaction.targetCurrency),
    ...tagReferenceErrors(refs, `订阅规则 ${rule.id}`, rule.transaction.tagIds),
  ]);
}

function currencyErrors(refs: ReturnType<typeof referenceSets>, label: string, ...currencies: readonly (string | undefined)[]): readonly string[] {
  return currencies.flatMap((currency) => missingOptionalRef(refs.currencies, currency, `${label} 引用不存在的币种 ${currency}`));
}

function tagReferenceErrors(refs: ReturnType<typeof referenceSets>, label: string, tagIds: readonly string[]): readonly string[] {
  return tagIds.flatMap((id) => missingRef(refs.tags, id, `${label} 引用不存在的标签 ${id}`));
}

function missingCreditAccount(refs: ReturnType<typeof referenceSets>, id: string, message: string): readonly string[] {
  return refs.creditAccounts.has(id) ? [] : [message];
}

function missingOptionalRef(refs: ReadonlySet<string>, id: string | undefined, message: string): readonly string[] {
  return id ? missingRef(refs, id, message) : [];
}

function missingRef(refs: ReadonlySet<string>, id: string, message: string): readonly string[] {
  return refs.has(id) ? [] : [message];
}
