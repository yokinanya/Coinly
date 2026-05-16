import type { CurrencyCode, Transaction, TransactionDraft } from "../domain/types";

export function initialTransactionDraft(accountId: string, currency: CurrencyCode): TransactionDraft {
  return {
    kind: "expense",
    accountId,
    amount: 0,
    currency,
    occurredAt: new Date().toISOString(),
    tagIds: [],
    note: "",
  };
}

export function draftFromTransaction(transaction: Transaction): TransactionDraft {
  return {
    kind: transaction.kind,
    accountId: transaction.accountId,
    amount: transaction.amount,
    currency: transaction.currency,
    targetAmount: transaction.targetAmount,
    targetCurrency: transaction.targetCurrency,
    occurredAt: transaction.occurredAt,
    categoryId: transaction.categoryId,
    tagIds: transaction.tagIds,
    note: transaction.note,
    relatedAccountId: transaction.relatedAccountId,
    refundOfTransactionId: transaction.refundOfTransactionId,
  };
}
