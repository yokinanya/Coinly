import { describe, expect, it } from "vitest";
import { initialData } from "./factory";
import { combinedStatementStats, deleteStatement, revokeStatementSettlement, settleStatement, statementBillingTotals, statementDetails, statementMonthOptions, statementSettlementTransactionIds, summarizeStatement, updateStatementAdjustments, updateStatementBillingAmounts } from "./statements";
import type { AppData, CreditCardStatement, Transaction } from "./types";

describe("credit card statements", () => {
  it("summarizes foreign currencies and preserves original transactions", () => {
    const data = statementFixture();
    const rows = summarizeStatement(data.transactions, data.statements[0]);

    expect(rows).toEqual([{ currency: "USD", amount: 20 }]);
    expect(settleStatement(data, "statement", "cash", 145, "CNY").transactions).toHaveLength(2);
    expect(data.transactions[0].amount).toBe(20);
  });

  it("records settlement details on the statement", () => {
    const settled = settleStatement(statementFixture(), "statement", "cash", 145, "CNY");

    expect(settled.statements[0]).toMatchObject({
      paid: true,
      settlementAccountId: "cash",
      settlementAmount: 145,
      settlementCurrency: "CNY",
    });
    expect(settled.transactions[1].statementId).toBe("statement");
  });

  it("revokes settlement by removing only the settlement transaction", () => {
    const settled = settleStatement(statementFixture(), "statement", "cash", 145, "CNY");
    const revoked = revokeStatementSettlement(settled, "statement");

    expect(revoked.statements[0].paid).toBe(false);
    expect(revoked.statements[0].settlementAmount).toBeUndefined();
    expect(revoked.transactions).toHaveLength(1);
    expect(revoked.transactions[0].id).toBe("tx");
  });

  it("deletes generated statements and settlement transactions", () => {
    const settled = settleStatement(statementFixture(), "statement", "cash", 145, "CNY");
    const deleted = deleteStatement(settled, "statement");

    expect(deleted.statements).toHaveLength(0);
    expect(deleted.transactions).toHaveLength(1);
    expect(deleted.transactions[0].id).toBe("tx");
  });

  it("requires a real settlement source account", () => {
    expect(() => settleStatement(statementFixture(), "statement", "card", 145, "CNY")).toThrow("不能是当前信用卡");
    expect(() => settleStatement(statementFixture(), "statement", "missing", 145, "CNY")).toThrow("不存在");
  });

  it("blocks duplicate settlement", () => {
    const settled = settleStatement(statementFixture(), "statement", "cash", 145, "CNY");

    expect(() => settleStatement(settled, "statement", "cash", 145, "CNY")).toThrow("不能重复结算");
  });

  it("adds statement adjustments to totals without creating transactions", () => {
    const adjusted = updateStatementAdjustments(statementFixture(), "statement", [{ accountId: "card", amount: 125, currency: "CNY", note: "首月补差" }]);
    const details = statementDetails(adjusted.transactions, adjusted.statements[0]);

    expect(adjusted.transactions).toHaveLength(1);
    expect(details.adjustments).toHaveLength(1);
    expect(details.adjustments[0]).toMatchObject({ accountId: "card", amount: 125, currency: "CNY", note: "首月补差" });
    expect(details.totals).toEqual([
      { currency: "USD", amount: 20 },
      { currency: "CNY", amount: 125 },
    ]);
  });

  it("rejects statement adjustments in currencies unsupported by the selected card", () => {
    expect(() => updateStatementAdjustments(statementFixture(), "statement", [{ accountId: "card", amount: 125, currency: "USD" }]))
      .toThrow("补差币种不受该信用卡支持");
  });

  it("validates adjustment currencies per card in a combined statement", () => {
    const base = combinedStatementFixture();
    const first = { ...base.accounts[0], currencyCodes: ["CNY", "USD"] };
    const second = { ...base.accounts[1], currencyCodes: ["CNY", "JPY"] };
    const data = { ...base, accounts: [first, second, ...base.accounts.slice(2)] };

    expect(() => updateStatementAdjustments(data, "combined", [
      { accountId: "card-a", amount: 40, currency: "USD" },
      { accountId: "card-b", amount: 800, currency: "JPY" },
    ])).not.toThrow();
    expect(() => updateStatementAdjustments(data, "combined", [{ accountId: "card-b", amount: 40, currency: "USD" }]))
      .toThrow("补差币种不受该信用卡支持");
  });

  it("records bank CNY billing amounts without changing original currency details", () => {
    const billed = updateStatementBillingAmounts(statementFixture(), "statement", [{ accountId: "card", amount: 145, currency: "CNY" }]);
    const details = statementDetails(billed.transactions, billed.statements[0]);

    expect(billed.transactions).toHaveLength(1);
    expect(statementBillingTotals(billed.statements[0])).toEqual([{ currency: "CNY", amount: 145 }]);
    expect(details.totals).toEqual([{ currency: "USD", amount: 20 }]);
  });

  it("uses bank CNY billing amounts when settling a single-card statement", () => {
    const billed = updateStatementBillingAmounts(statementFixture(), "statement", [{ accountId: "card", amount: 145, currency: "CNY" }]);
    const settled = settleStatement(billed, "statement", "cash", 0, "USD");
    const payment = settled.transactions.find((transaction) => transaction.kind === "credit_payment");

    expect(settled.statements[0]).toMatchObject({ paid: true, settlementAmount: 145, settlementCurrency: "CNY" });
    expect(payment).toMatchObject({ accountId: "card", amount: 145, currency: "CNY", relatedAccountId: "cash" });
  });

  it("treats refunds in the statement period as expense reductions", () => {
    const base = statementFixture();
    const refund = { ...transaction("refund", "card", 5, "USD", "2026-01-03T00:00:00.000Z"), kind: "refund" as const, note: "退款", refundOfTransactionId: "tx" };
    const data = { ...base, transactions: [...base.transactions, refund] };
    const details = statementDetails(data.transactions, data.statements[0]);

    expect(details.transactions.map((item) => item.id)).toEqual(["tx", "refund"]);
    expect(details.totals).toEqual([{ currency: "USD", amount: 15 }]);
  });

  it("builds statement month options from statement end dates", () => {
    expect(statementMonthOptions(combinedFixture().statements)).toEqual([
      { key: "2026-02", label: "2026年2月" },
      { key: "2026-01", label: "2026年1月" },
    ]);
  });

  it("combines same-month statement totals by original transaction currencies", () => {
    const stats = combinedStatementStats(combinedFixture(), "2026-01");

    expect(stats.statementCount).toBe(2);
    expect(stats.paidCount).toBe(1);
    expect(stats.unpaidCount).toBe(1);
    expect(stats.transactionCount).toBe(3);
    expect(stats.totals).toEqual([
      { currency: "CNY", amount: 150 },
      { currency: "USD", amount: 20 },
    ]);
  });

  it("keeps other statement months out of the combined statistics", () => {
    const stats = combinedStatementStats(combinedFixture(), "2026-02");

    expect(stats.statements.map((statement) => statement.id)).toEqual(["feb-card-a"]);
    expect(stats.transactionCount).toBe(1);
    expect(stats.totals).toEqual([{ currency: "CNY", amount: 80 }]);
  });

  it("counts statements even when a month has no spending details", () => {
    const base = combinedFixture();
    const data = { ...base, statements: [statement("empty", "card-a", "2026-03-31T23:59:59.000Z", false)], transactions: [] };
    const stats = combinedStatementStats(data, "2026-03");

    expect(stats.statementCount).toBe(1);
    expect(stats.transactionCount).toBe(0);
    expect(stats.totals).toEqual([]);
  });

  it("collects details from every card in a combined statement", () => {
    const data = combinedStatementFixture();
    const details = statementDetails(data.transactions, data.statements[0]);

    expect(details.transactions.map((transaction) => transaction.id)).toEqual(["card-a-cny", "card-a-usd", "card-b-cny"]);
    expect(details.totals).toEqual([
      { currency: "CNY", amount: 150 },
      { currency: "USD", amount: 20 },
    ]);
  });

  it("settles a combined statement by splitting payments per card and currency", () => {
    const settled = settleStatement(combinedStatementFixture(), "combined", "cash", 0, "CNY");
    const statement = settled.statements[0];
    const payments = settled.transactions.filter((transaction) => transaction.kind === "credit_payment");

    expect(statement.paid).toBe(true);
    expect(statement.settlementAmount).toBeUndefined();
    expect(statementSettlementTransactionIds(statement)).toHaveLength(3);
    expect(payments.map((transaction) => [transaction.accountId, transaction.currency, transaction.amount, transaction.relatedAccountId])).toEqual([
      ["card-a", "CNY", 100, "cash"],
      ["card-a", "USD", 20, "cash"],
      ["card-b", "CNY", 50, "cash"],
    ]);

    const revoked = revokeStatementSettlement(settled, "combined");
    expect(revoked.statements[0].paid).toBe(false);
    expect(revoked.transactions.filter((transaction) => transaction.kind === "credit_payment")).toEqual([]);
  });

  it("uses statement adjustments when splitting combined settlement payments", () => {
    const adjusted = updateStatementAdjustments(combinedStatementFixture(), "combined", [{ accountId: "card-b", amount: 70, currency: "USD" }]);
    const settled = settleStatement(adjusted, "combined", "cash", 0, "CNY");
    const payments = settled.transactions.filter((transaction) => transaction.kind === "credit_payment");

    expect(payments.map((transaction) => [transaction.accountId, transaction.currency, transaction.amount])).toEqual([
      ["card-a", "CNY", 100],
      ["card-a", "USD", 20],
      ["card-b", "CNY", 50],
      ["card-b", "USD", 70],
    ]);
  });

  it("uses bank CNY billing amounts when splitting combined settlement payments", () => {
    const billed = updateStatementBillingAmounts(combinedStatementFixture(), "combined", [
      { accountId: "card-a", amount: 812.34, currency: "CNY" },
      { accountId: "card-b", amount: 321, currency: "CNY" },
    ]);
    const settled = settleStatement(billed, "combined", "cash", 0, "CNY");
    const payments = settled.transactions.filter((transaction) => transaction.kind === "credit_payment");

    expect(statementBillingTotals(settled.statements[0])).toEqual([{ currency: "CNY", amount: 1133.34 }]);
    expect(payments.map((transaction) => [transaction.accountId, transaction.currency, transaction.amount])).toEqual([
      ["card-a", "CNY", 812.34],
      ["card-b", "CNY", 321],
    ]);
  });

  it("subtracts refunds before splitting combined settlement payments", () => {
    const base = combinedStatementFixture();
    const refund = { ...transaction("card-a-refund", "card-a", 60, "CNY", "2026-01-13T00:00:00.000Z"), kind: "refund" as const, refundOfTransactionId: "card-a-cny" };
    const settled = settleStatement({ ...base, transactions: [...base.transactions, refund] }, "combined", "cash", 0, "CNY");
    const payments = settled.transactions.filter((transaction) => transaction.kind === "credit_payment");

    expect(payments.map((transaction) => [transaction.accountId, transaction.currency, transaction.amount])).toEqual([
      ["card-a", "CNY", 40],
      ["card-a", "USD", 20],
      ["card-b", "CNY", 50],
    ]);
  });
});

function statementFixture(): AppData {
  const base = initialData();
  const account = { ...base.accounts[0], id: "card", kind: "credit" as const, currency: "CNY" as const };
  const cash = { ...base.accounts[0], id: "cash", name: "现金", kind: "cash" as const, currency: "CNY" as const };
  return {
    ...base,
    accounts: [account, cash],
    statements: [{
      id: "statement",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      accountId: "card",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-31T23:59:59.000Z",
      primaryCurrency: "CNY",
      paid: false,
    }],
    transactions: [{
      id: "tx",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      accountId: "card",
      amount: 20,
      currency: "USD",
      kind: "expense",
      occurredAt: "2026-01-02T00:00:00.000Z",
      tagIds: [],
      note: "foreign",
    }],
  };
}

function combinedFixture(): AppData {
  const base = initialData();
  const account = { ...base.accounts[0], id: "card-a", name: "主卡", kind: "credit" as const, currency: "CNY" as const, currencyCodes: ["CNY", "USD"] };
  const secondAccount = { ...base.accounts[0], id: "card-b", name: "副卡", kind: "credit" as const, currency: "CNY" as const, currencyCodes: ["CNY", "USD"] };
  const cash = { ...base.accounts[0], id: "cash", name: "现金", kind: "cash" as const, currency: "CNY" as const };
  return {
    ...base,
    accounts: [account, secondAccount, cash],
    statements: [
      statement("jan-card-a", "card-a", "2026-01-31T23:59:59.000Z", true),
      statement("jan-card-b", "card-b", "2026-01-28T23:59:59.000Z", false),
      statement("feb-card-a", "card-a", "2026-02-28T23:59:59.000Z", false),
    ],
    transactions: [
      transaction("jan-cny", "card-a", 100, "CNY", "2026-01-10T00:00:00.000Z"),
      transaction("jan-usd", "card-a", 20, "USD", "2026-01-11T00:00:00.000Z"),
      transaction("jan-card-b", "card-b", 50, "CNY", "2026-01-12T00:00:00.000Z"),
      transaction("feb-card-a", "card-a", 80, "CNY", "2026-02-12T00:00:00.000Z"),
      transaction("cash", "cash", 999, "CNY", "2026-01-12T00:00:00.000Z"),
    ],
  };
}

function combinedStatementFixture(): AppData {
  const base = combinedFixture();
  return {
    ...base,
    statements: [{
      id: "combined",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      accountId: "card-a",
      accountIds: ["card-a", "card-b"],
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-31T23:59:59.000Z",
      primaryCurrency: "CNY",
      paid: false,
    }],
    transactions: [
      transaction("card-a-cny", "card-a", 100, "CNY", "2026-01-10T00:00:00.000Z"),
      transaction("card-a-usd", "card-a", 20, "USD", "2026-01-11T00:00:00.000Z"),
      transaction("card-b-cny", "card-b", 50, "CNY", "2026-01-12T00:00:00.000Z"),
      transaction("cash", "cash", 999, "CNY", "2026-01-12T00:00:00.000Z"),
    ],
  };
}

function statement(id: string, accountId: string, endAt: string, paid: boolean): CreditCardStatement {
  const month = endAt.slice(0, 7);
  return {
    id,
    createdAt: `${month}-01T00:00:00.000Z`,
    updatedAt: `${month}-01T00:00:00.000Z`,
    accountId,
    startAt: `${month}-01T00:00:00.000Z`,
    endAt,
    primaryCurrency: "CNY",
    paid,
  };
}

function transaction(id: string, accountId: string, amount: number, currency: string, occurredAt: string): Transaction {
  return {
    id,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    accountId,
    amount,
    currency,
    kind: "expense",
    occurredAt,
    tagIds: [],
    note: id,
  };
}
