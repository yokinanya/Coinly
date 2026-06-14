export type CurrencyCode = string;

export type AccountKind = "cash" | "debit" | "credit" | "alipay" | "wechat" | "other";

export type TransactionKind =
  | "income"
  | "expense"
  | "refund"
  | "transfer"
  | "credit_payment";

export type CategoryDirection = "income" | "expense";

export type RecurringInterval = "monthly" | "yearly";

export type SyncProvider = "s3-compatible" | "onedrive" | "google-drive" | "webdav";

export type ThemeMode = "system" | "light" | "dark";

export interface EntityBase {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Account extends EntityBase {
  readonly name: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
  readonly currencyCodes?: readonly CurrencyCode[];
  readonly statementDay?: number;
  readonly paymentDueDay?: number;
}

export interface Category extends EntityBase {
  readonly name: string;
  readonly direction: CategoryDirection;
  readonly parentId?: string;
}

export interface Tag extends EntityBase {
  readonly name: string;
}

export interface Transaction extends EntityBase {
  readonly kind: TransactionKind;
  readonly accountId: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly targetAmount?: number;
  readonly targetCurrency?: CurrencyCode;
  readonly occurredAt: string;
  readonly categoryId?: string;
  readonly tagIds: readonly string[];
  readonly note: string;
  readonly relatedAccountId?: string;
  readonly statementId?: string;
  readonly sourceRecurringRuleId?: string;
  readonly refundOfTransactionId?: string;
}

export interface RecurringRule extends EntityBase {
  readonly name: string;
  readonly enabled: boolean;
  readonly interval: RecurringInterval;
  readonly nextRunAt: string;
  readonly transaction: Omit<Transaction, keyof EntityBase | "sourceRecurringRuleId">;
}

export interface Budget extends EntityBase {
  readonly name: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly categoryIds: readonly string[];
  readonly tagIds: readonly string[];
  readonly offsetCategoryIds?: readonly string[];
  readonly period: "monthly" | "yearly";
}

export interface CreditCardStatementAdjustment {
  readonly id: string;
  readonly accountId: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly note: string;
}

export interface CreditCardStatementBillingAmount {
  readonly id: string;
  readonly accountId: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly note: string;
}

export interface CreditCardStatement extends EntityBase {
  readonly accountId: string;
  readonly accountIds?: readonly string[];
  readonly adjustments?: readonly CreditCardStatementAdjustment[];
  readonly billingAmounts?: readonly CreditCardStatementBillingAmount[];
  readonly startAt: string;
  readonly endAt: string;
  readonly primaryCurrency: CurrencyCode;
  readonly paid: boolean;
  readonly settlementAmount?: number;
  readonly settlementCurrency?: CurrencyCode;
  readonly settledAt?: string;
  readonly settlementAccountId?: string;
  readonly settlementTransactionId?: string;
  readonly settlementTransactionIds?: readonly string[];
}

export interface SyncTarget {
  readonly id?: string;
  readonly name?: string;
  readonly enabled: boolean;
  readonly provider: SyncProvider;
  readonly endpoint: string;
  readonly bucket?: string;
  readonly objectKey: string;
  readonly region?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly forcePathStyle?: boolean;
  readonly driveFileId?: string;
  readonly driveFolderId?: string;
  readonly accessToken?: string;
  readonly proxyBaseUrl?: string;
  readonly directoryPath?: string;
  readonly webdavUrl?: string;
  readonly webdavUsername?: string;
  readonly webdavPassword?: string;
  readonly accountId?: string;
  readonly username?: string;
  readonly accountType?: "personal" | "work";
}

export interface SyncSettings {
  readonly enabled: boolean;
  readonly targets?: readonly SyncTarget[];
  readonly lastSyncedAt?: string;
}

export interface AiModelSettings {
  readonly model: string;
  readonly contextTokenBudget?: number;
  readonly supportsVision?: boolean;
}

export interface AiSettings {
  readonly provider: "openai-compatible";
  readonly endpoint: string;
  readonly apiKey: string;
  readonly textModel?: AiModelSettings;
  readonly visionModel?: AiModelSettings;
  readonly model?: string;
  readonly contextTokenBudget?: number;
  readonly supportsVision?: boolean;
}

export interface UiSettings {
  readonly theme: ThemeMode;
  readonly syncTargetLastSyncedAt?: Readonly<Record<string, string>>;
  readonly recentEntry?: {
    readonly accountId?: string;
    readonly currency?: CurrencyCode;
    readonly categoryId?: string;
    readonly tagIds?: readonly string[];
  };
}

export interface AppData {
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly currencies: readonly CurrencyCode[];
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly tags: readonly Tag[];
  readonly transactions: readonly Transaction[];
  readonly recurringRules: readonly RecurringRule[];
  readonly budgets: readonly Budget[];
  readonly statements: readonly CreditCardStatement[];
  readonly syncSettings?: SyncSettings;
  readonly aiSettings?: AiSettings;
  readonly uiSettings?: UiSettings;
  readonly localVersion: number;
}

export interface TransactionDraft {
  readonly kind: TransactionKind;
  readonly accountId: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly targetAmount?: number;
  readonly targetCurrency?: CurrencyCode;
  readonly occurredAt: string;
  readonly categoryId?: string;
  readonly tagIds: readonly string[];
  readonly note: string;
  readonly relatedAccountId?: string;
  readonly statementId?: string;
  readonly refundOfTransactionId?: string;
}
