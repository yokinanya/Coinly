import type { AccountKind, CurrencyCode, RecurringInterval, TransactionKind } from "./types";

export const DEFAULT_CURRENCIES: readonly CurrencyCode[] = ["CNY", "USD", "HKD", "JPY", "EUR", "GBP"];

export const ACCOUNT_KINDS: readonly AccountKind[] = ["cash", "debit", "credit", "alipay", "wechat", "other"];

export const TRANSACTION_KINDS: readonly TransactionKind[] = [
  "income",
  "expense",
  "refund",
  "transfer",
  "credit_payment",
];

export const RECURRING_INTERVALS: readonly RecurringInterval[] = ["monthly", "yearly"];

export const DAY_MIN = 1;
export const DAY_MAX = 31;
