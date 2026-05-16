import { describe, expect, it } from "vitest";
import { initialData } from "./factory";
import { deleteStatement, revokeStatementSettlement, settleStatement, summarizeStatement } from "./statements";
import type { AppData } from "./types";

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
