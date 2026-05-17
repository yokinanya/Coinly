import { bumpVersion, createTransaction } from "./factory";
import type { AppData, CreditCardStatement, CurrencyCode, Transaction } from "./types";

export interface StatementCurrencyTotal {
  readonly currency: CurrencyCode;
  readonly amount: number;
}

export interface StatementDetails {
  readonly transactions: readonly Transaction[];
  readonly totals: readonly StatementCurrencyTotal[];
}

export function statementTransactions(
  transactions: readonly Transaction[],
  statement: CreditCardStatement,
): readonly Transaction[] {
  return transactions.filter((transaction) => {
    return transaction.accountId === statement.accountId
      && transaction.kind === "expense"
      && transaction.occurredAt >= statement.startAt
      && transaction.occurredAt <= statement.endAt;
  });
}

export function statementDetails(
  transactions: readonly Transaction[],
  statement: CreditCardStatement,
): StatementDetails {
  const rows = new Map<CurrencyCode, number>();
  const details = transactions.filter((transaction) => {
    const matches = transaction.accountId === statement.accountId
      && transaction.kind === "expense"
      && transaction.occurredAt >= statement.startAt
      && transaction.occurredAt <= statement.endAt;
    if (matches) rows.set(transaction.currency, (rows.get(transaction.currency) ?? 0) + transaction.amount);
    return matches;
  });
  return {
    transactions: details,
    totals: [...rows.entries()].map(([currency, amount]) => ({ currency, amount })),
  };
}

export function summarizeStatement(
  transactions: readonly Transaction[],
  statement: CreditCardStatement,
): readonly StatementCurrencyTotal[] {
  return statementDetails(transactions, statement).totals;
}

export function settleStatement(
  data: AppData,
  statementId: string,
  settlementAccountId: string,
  amount: number,
  currency: CurrencyCode,
): AppData {
  const statement = data.statements.find((item) => item.id === statementId);
  if (!statement) {
    throw new Error(`Credit card statement not found: ${statementId}`);
  }
  if (statement.paid) {
    throw new Error("该账期已还款，不能重复结算");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("还款金额必须大于 0");
  }
  if (settlementAccountId && settlementAccountId === statement.accountId) {
    throw new Error("还款来源账户不能是当前信用卡账户");
  }
  if (settlementAccountId && !data.accounts.some((account) => account.id === settlementAccountId)) {
    throw new Error("还款来源账户不存在");
  }
  const settledAt = new Date().toISOString();
  const payment = createTransaction({
    kind: "credit_payment",
    accountId: statement.accountId,
    relatedAccountId: settlementAccountId || undefined,
    amount,
    currency,
    occurredAt: settledAt,
    tagIds: [],
    note: "信用卡账期汇总结算",
    statementId: statement.id,
  });
  return bumpVersion({
    ...data,
    statements: markPaid(data.statements, {
      amount,
      currency,
      settledAt,
      settlementAccountId,
      statementId: statement.id,
      transactionId: payment.id,
    }),
    transactions: [...data.transactions, payment],
  });
}

export function revokeStatementSettlement(data: AppData, statementId: string): AppData {
  const statement = data.statements.find((item) => item.id === statementId);
  if (!statement) {
    throw new Error(`Credit card statement not found: ${statementId}`);
  }
  if (!statement.paid || !statement.settlementTransactionId) {
    throw new Error("该账期尚未结算");
  }
  return bumpVersion({
    ...data,
    statements: data.statements.map((item) => item.id === statementId ? revokePaid(item) : item),
    transactions: data.transactions.filter((item) => item.id !== statement.settlementTransactionId),
  });
}

export function deleteStatement(data: AppData, statementId: string): AppData {
  const statement = data.statements.find((item) => item.id === statementId);
  if (!statement) {
    throw new Error(`Credit card statement not found: ${statementId}`);
  }
  return bumpVersion({
    ...data,
    statements: data.statements.filter((item) => item.id !== statementId),
    transactions: removeStatementReferences(data.transactions, statement),
  });
}

interface SettlementMark {
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly settledAt: string;
  readonly settlementAccountId: string;
  readonly statementId: string;
  readonly transactionId: string;
}

function markPaid(
  statements: readonly CreditCardStatement[],
  settlement: SettlementMark,
): readonly CreditCardStatement[] {
  return statements.map((statement) => {
    if (statement.id !== settlement.statementId) {
      return statement;
    }
    return {
      ...statement,
      paid: true,
      settledAt: settlement.settledAt,
      settlementAccountId: settlement.settlementAccountId || undefined,
      settlementAmount: settlement.amount,
      settlementCurrency: settlement.currency,
      settlementTransactionId: settlement.transactionId,
    };
  });
}

function revokePaid(statement: CreditCardStatement): CreditCardStatement {
  return {
    ...statement,
    paid: false,
    settledAt: undefined,
    settlementAccountId: undefined,
    settlementAmount: undefined,
    settlementCurrency: undefined,
    settlementTransactionId: undefined,
  };
}

function removeStatementReferences(
  transactions: readonly Transaction[],
  statement: CreditCardStatement,
): readonly Transaction[] {
  return transactions.flatMap((transaction) => {
    if (transaction.id === statement.settlementTransactionId) {
      return [];
    }
    if (transaction.statementId !== statement.id) {
      return [transaction];
    }
    return [{ ...transaction, statementId: undefined }];
  });
}
