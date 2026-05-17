import type { AccountKind, RecurringInterval, TransactionKind } from "../domain/types";

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  income: "收入",
  expense: "支出",
  refund: "退款",
  transfer: "转账",
  credit_payment: "信用卡还款",
};

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: "现金",
  debit: "储蓄卡",
  credit: "信用卡",
  alipay: "支付宝",
  wechat: "微信",
  other: "其他",
};

export const RECURRING_INTERVAL_LABELS: Record<RecurringInterval, string> = {
  monthly: "每月",
  yearly: "每年",
};

export const BUDGET_PERIOD_LABELS: Record<"monthly" | "yearly", string> = {
  monthly: "月度",
  yearly: "年度",
};
