import { bumpVersion, createId, createTransaction, touchEntity } from "./factory";
import { accountCurrencyOptions } from "./recurring";
import type { AppData, CreditCardStatement, CreditCardStatementAdjustment, CreditCardStatementBillingAmount, CurrencyCode, Transaction } from "./types";

export interface StatementCurrencyTotal {
  readonly currency: CurrencyCode;
  readonly amount: number;
}

export interface StatementDetails {
  readonly transactions: readonly Transaction[];
  readonly adjustments: readonly CreditCardStatementAdjustment[];
  readonly totals: readonly StatementCurrencyTotal[];
}

export interface StatementBillingAmountInput {
  readonly id?: string;
  readonly accountId: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly note?: string;
}

export interface StatementAdjustmentInput {
  readonly id?: string;
  readonly accountId: string;
  readonly amount: number;
  readonly currency: CurrencyCode;
  readonly note?: string;
}

export interface StatementAccountCurrencyTotal extends StatementCurrencyTotal {
  readonly accountId: string;
}

export type StatementAccountBillingTotal = StatementAccountCurrencyTotal;

export interface StatementMonthOption {
  readonly key: string;
  readonly label: string;
}

export interface CombinedStatementStats {
  readonly monthKey: string;
  readonly statements: readonly CreditCardStatement[];
  readonly statementCount: number;
  readonly paidCount: number;
  readonly unpaidCount: number;
  readonly transactionCount: number;
  readonly adjustmentCount: number;
  readonly billingAmountCount: number;
  readonly totals: readonly StatementCurrencyTotal[];
  readonly billingTotals: readonly StatementCurrencyTotal[];
}

export function statementTransactions(
  transactions: readonly Transaction[],
  statement: CreditCardStatement,
): readonly Transaction[] {
  const accountIds = new Set(statementAccountIds(statement));
  return transactions.filter((transaction) => {
    return accountIds.has(transaction.accountId)
      && isStatementTransaction(transaction)
      && transaction.occurredAt >= statement.startAt
      && transaction.occurredAt <= statement.endAt;
  });
}

export function statementDetails(
  transactions: readonly Transaction[],
  statement: CreditCardStatement,
): StatementDetails {
  const rows = new Map<CurrencyCode, number>();
  const details = statementTransactions(transactions, statement);
  const adjustments = statementAdjustments(statement);
  details.forEach((transaction) => rows.set(transaction.currency, (rows.get(transaction.currency) ?? 0) + statementTransactionAmount(transaction)));
  adjustments.forEach((adjustment) => rows.set(adjustment.currency, (rows.get(adjustment.currency) ?? 0) + adjustment.amount));
  return {
    transactions: details,
    adjustments,
    totals: [...rows.entries()].map(([currency, amount]) => ({ currency, amount })),
  };
}

export function statementAccountIds(statement: CreditCardStatement): readonly string[] {
  return [...new Set([statement.accountId, ...(statement.accountIds ?? [])])];
}

export function isCombinedStatement(statement: CreditCardStatement): boolean {
  return statementAccountIds(statement).length > 1;
}

export function statementAdjustments(statement: CreditCardStatement): readonly CreditCardStatementAdjustment[] {
  return statement.adjustments ?? [];
}

export function statementBillingAmounts(statement: CreditCardStatement): readonly CreditCardStatementBillingAmount[] {
  return statement.billingAmounts ?? [];
}

export function summarizeStatement(
  transactions: readonly Transaction[],
  statement: CreditCardStatement,
): readonly StatementCurrencyTotal[] {
  return statementDetails(transactions, statement).totals;
}

export function statementMonthKey(statement: CreditCardStatement): string {
  return statement.endAt.slice(0, 7);
}

export function statementMonthOptions(statements: readonly CreditCardStatement[]): readonly StatementMonthOption[] {
  const keys = [...new Set(statements.map(statementMonthKey))].sort((left, right) => right.localeCompare(left));
  return keys.map((key) => ({ key, label: statementMonthLabel(key) }));
}

export function combinedStatementStats(data: AppData, monthKey: string): CombinedStatementStats {
  const statements = data.statements.filter((statement) => statementMonthKey(statement) === monthKey);
  const totals = new Map<CurrencyCode, number>();
  const billingTotals = new Map<CurrencyCode, number>();
  let transactionCount = 0;
  let adjustmentCount = 0;
  let billingAmountCount = 0;

  for (const statement of statements) {
    const details = statementDetails(data.transactions, statement);
    const billingAmounts = statementBillingAmounts(statement);
    transactionCount += details.transactions.length;
    adjustmentCount += details.adjustments.length;
    billingAmountCount += billingAmounts.length;
    for (const total of details.totals) {
      totals.set(total.currency, (totals.get(total.currency) ?? 0) + total.amount);
    }
    for (const total of statementBillingTotals(statement)) {
      billingTotals.set(total.currency, (billingTotals.get(total.currency) ?? 0) + total.amount);
    }
  }

  const paidCount = statements.filter((statement) => statement.paid).length;
  return {
    monthKey,
    statements,
    statementCount: statements.length,
    paidCount,
    unpaidCount: statements.length - paidCount,
    transactionCount,
    adjustmentCount,
    billingAmountCount,
    totals: [...totals.entries()].map(([currency, amount]) => ({ currency, amount })),
    billingTotals: [...billingTotals.entries()].map(([currency, amount]) => ({ currency, amount })),
  };
}

export function statementAccountCurrencyTransactionTotals(data: AppData, statement: CreditCardStatement): readonly StatementAccountCurrencyTotal[] {
  const rows = new Map<string, StatementAccountCurrencyTotal>();
  for (const transaction of statementTransactions(data.transactions, statement)) {
    addAccountCurrencyTotal(rows, transaction.accountId, transaction.currency, statementTransactionAmount(transaction));
  }
  return [...rows.values()];
}

export function statementAccountCurrencyTotals(data: AppData, statement: CreditCardStatement): readonly StatementAccountCurrencyTotal[] {
  const rows = new Map<string, StatementAccountCurrencyTotal>();
  for (const transaction of statementTransactions(data.transactions, statement)) {
    addAccountCurrencyTotal(rows, transaction.accountId, transaction.currency, statementTransactionAmount(transaction));
  }
  for (const adjustment of statementAdjustments(statement)) {
    addAccountCurrencyTotal(rows, adjustment.accountId, adjustment.currency, adjustment.amount);
  }
  return [...rows.values()];
}

export function statementBillingTotals(statement: CreditCardStatement): readonly StatementCurrencyTotal[] {
  const rows = new Map<CurrencyCode, number>();
  for (const amount of statementBillingAmounts(statement)) {
    rows.set(amount.currency, (rows.get(amount.currency) ?? 0) + amount.amount);
  }
  return [...rows.entries()].map(([currency, amount]) => ({ currency, amount: roundMoney(amount) }));
}

export function statementAccountBillingTotals(statement: CreditCardStatement): readonly StatementAccountBillingTotal[] {
  const rows = new Map<string, StatementAccountBillingTotal>();
  for (const amount of statementBillingAmounts(statement)) {
    addAccountCurrencyTotal(rows, amount.accountId, amount.currency, amount.amount);
  }
  return [...rows.values()].map((row) => ({ ...row, amount: roundMoney(row.amount) }));
}

export function updateStatementBillingAmounts(
  data: AppData,
  statementId: string,
  inputs: readonly StatementBillingAmountInput[],
): AppData {
  const statement = data.statements.find((item) => item.id === statementId);
  if (!statement) {
    throw new Error(`Credit card statement not found: ${statementId}`);
  }
  if (statement.paid) {
    throw new Error("已结算账期不能修改银行出账金额");
  }
  const accountIds = new Set(statementAccountIds(statement));
  const seen = new Set<string>();
  const billingAmounts = inputs.flatMap((input) => {
    if (!accountIds.has(input.accountId)) {
      throw new Error("银行出账账户必须属于当前账期");
    }
    if (!data.currencies.includes(input.currency)) {
      throw new Error("银行出账币种不存在");
    }
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      throw new Error("银行出账金额不能小于 0");
    }
    if (input.amount === 0) {
      return [];
    }
    const key = `${input.accountId}\u0000${input.currency}`;
    if (seen.has(key)) {
      throw new Error("同一信用卡和币种只能保留一项银行出账金额");
    }
    seen.add(key);
    return [{
      id: input.id || createId(),
      accountId: input.accountId,
      amount: roundMoney(input.amount),
      currency: input.currency,
      note: input.note?.trim() || "银行账单出账金额",
    } satisfies CreditCardStatementBillingAmount];
  });
  return bumpVersion({
    ...data,
    statements: data.statements.map((item) => item.id === statementId
      ? touchEntity({ ...item, billingAmounts: billingAmounts.length > 0 ? billingAmounts : undefined })
      : item),
  });
}

export function updateStatementAdjustments(
  data: AppData,
  statementId: string,
  inputs: readonly StatementAdjustmentInput[],
): AppData {
  const statement = data.statements.find((item) => item.id === statementId);
  if (!statement) {
    throw new Error(`Credit card statement not found: ${statementId}`);
  }
  if (statement.paid) {
    throw new Error("已结算账期不能修改补差项");
  }
  const accountIds = new Set(statementAccountIds(statement));
  const seen = new Set<string>();
  const adjustments = inputs.map((input) => {
    if (!accountIds.has(input.accountId)) {
      throw new Error("补差项账户必须属于当前账期");
    }
    const account = data.accounts.find((item) => item.id === input.accountId);
    if (!account) {
      throw new Error("补差项账户不存在");
    }
    if (!data.currencies.includes(input.currency)) {
      throw new Error("补差项币种不存在");
    }
    if (!accountCurrencyOptions(account).includes(input.currency)) {
      throw new Error("补差币种不受该信用卡支持");
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("补差金额必须大于 0");
    }
    const key = `${input.accountId}\u0000${input.currency}`;
    if (seen.has(key)) {
      throw new Error("同一信用卡和币种只能保留一项补差");
    }
    seen.add(key);
    return {
      id: input.id || createId(),
      accountId: input.accountId,
      amount: roundMoney(input.amount),
      currency: input.currency,
      note: input.note?.trim() || "历史消费补差",
    } satisfies CreditCardStatementAdjustment;
  });
  return bumpVersion({
    ...data,
    statements: data.statements.map((item) => item.id === statementId
      ? touchEntity({ ...item, adjustments: adjustments.length > 0 ? adjustments : undefined })
      : item),
  });
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
  if (isCombinedStatement(statement)) {
    return settleCombinedStatement(data, statement, settlementAccountId);
  }
  if (settlementAccountId && settlementAccountId === statement.accountId) {
    throw new Error("还款来源账户不能是当前信用卡账户");
  }
  if (settlementAccountId && !data.accounts.some((account) => account.id === settlementAccountId)) {
    throw new Error("还款来源账户不存在");
  }
  const billingRows = statementAccountBillingTotals(statement).filter((row) => row.amount > 0);
  if (billingRows.length > 0) {
    const settledAt = new Date().toISOString();
    const payments = settlementPayments(billingRows, settlementAccountId, settledAt, statement.id, "信用卡银行账单结算");
    return bumpVersion({
      ...data,
      statements: markPaid(data.statements, {
        amount: payments.length === 1 ? payments[0]?.amount : undefined,
        currency: payments.length === 1 ? payments[0]?.currency : undefined,
        settledAt,
        settlementAccountId,
        statementId: statement.id,
        transactionIds: payments.map((payment) => payment.id),
      }),
      transactions: [...data.transactions, ...payments],
    });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("还款金额必须大于 0");
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
      transactionIds: [payment.id],
    }),
    transactions: [...data.transactions, payment],
  });
}

export function settleCombinedStatement(data: AppData, statement: CreditCardStatement, settlementAccountId: string): AppData {
  if (!isCombinedStatement(statement)) {
    throw new Error("该账期不是合并账单");
  }
  if (statement.paid) {
    throw new Error("该账期已还款，不能重复结算");
  }
  const accountIds = statementAccountIds(statement);
  if (settlementAccountId && accountIds.includes(settlementAccountId)) {
    throw new Error("还款来源账户不能是当前信用卡账户");
  }
  if (settlementAccountId && !data.accounts.some((account) => account.id === settlementAccountId)) {
    throw new Error("还款来源账户不存在");
  }
  const settledAt = new Date().toISOString();
  const billingRows = statementAccountBillingTotals(statement).filter((row) => row.amount > 0);
  const originalRows = statementAccountCurrencyTotals(data, statement).filter((row) => row.amount > 0);
  const rows = billingRows.length > 0 ? billingRows : originalRows;
  const payments = settlementPayments(rows, settlementAccountId, settledAt, statement.id, billingRows.length > 0 ? "信用卡银行账单拆分结算" : "信用卡合并账期拆分结算");
  if (payments.length === 0) {
    throw new Error("账期暂无应还金额，无法结算");
  }
  return bumpVersion({
    ...data,
    statements: markPaid(data.statements, {
      settledAt,
      settlementAccountId,
      statementId: statement.id,
      transactionIds: payments.map((payment) => payment.id),
    }),
    transactions: [...data.transactions, ...payments],
  });
}

function settlementPayments(
  rows: readonly StatementAccountCurrencyTotal[],
  settlementAccountId: string,
  settledAt: string,
  statementId: string,
  note: string,
): readonly Transaction[] {
  return rows.map((row) => createTransaction({
    kind: "credit_payment",
    accountId: row.accountId,
    relatedAccountId: settlementAccountId || undefined,
    amount: row.amount,
    currency: row.currency,
    occurredAt: settledAt,
    tagIds: [],
    note,
    statementId,
  }));
}

export function revokeStatementSettlement(data: AppData, statementId: string): AppData {
  const statement = data.statements.find((item) => item.id === statementId);
  if (!statement) {
    throw new Error(`Credit card statement not found: ${statementId}`);
  }
  const settlementIds = statementSettlementTransactionIds(statement);
  if (!statement.paid || settlementIds.length === 0) {
    throw new Error("该账期尚未结算");
  }
  const settlementIdSet = new Set(settlementIds);
  return bumpVersion({
    ...data,
    statements: data.statements.map((item) => item.id === statementId ? revokePaid(item) : item),
    transactions: data.transactions.filter((item) => !settlementIdSet.has(item.id)),
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
  readonly amount?: number;
  readonly currency?: CurrencyCode;
  readonly settledAt: string;
  readonly settlementAccountId: string;
  readonly statementId: string;
  readonly transactionIds: readonly string[];
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
      settlementTransactionId: settlement.transactionIds[0],
      settlementTransactionIds: settlement.transactionIds,
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
    settlementTransactionIds: undefined,
  };
}

export function statementSettlementTransactionIds(statement: CreditCardStatement): readonly string[] {
  return [...new Set([...(statement.settlementTransactionIds ?? []), ...(statement.settlementTransactionId ? [statement.settlementTransactionId] : [])])];
}

function removeStatementReferences(
  transactions: readonly Transaction[],
  statement: CreditCardStatement,
): readonly Transaction[] {
  const settlementIdSet = new Set(statementSettlementTransactionIds(statement));
  return transactions.flatMap((transaction) => {
    if (settlementIdSet.has(transaction.id)) {
      return [];
    }
    if (transaction.statementId !== statement.id) {
      return [transaction];
    }
    return [{ ...transaction, statementId: undefined }];
  });
}

function statementMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

function addAccountCurrencyTotal(
  rows: Map<string, StatementAccountCurrencyTotal>,
  accountId: string,
  currency: CurrencyCode,
  amount: number,
): void {
  const key = `${accountId}\u0000${currency}`;
  const current = rows.get(key);
  rows.set(key, {
    accountId,
    currency,
    amount: (current?.amount ?? 0) + amount,
  });
}

function isStatementTransaction(transaction: Transaction): boolean {
  return transaction.kind === "expense" || transaction.kind === "refund";
}

function statementTransactionAmount(transaction: Transaction): number {
  return transaction.kind === "refund" ? -transaction.amount : transaction.amount;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
