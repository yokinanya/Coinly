import { describe, expect, it } from "vitest";
import { createId, initialData } from "./factory";
import {
  budgetPeriodRange,
  createStatementForAccount,
  deleteCurrency,
  deleteEntity,
  filterTransactions,
  spendingForBudgetPeriod,
  validateTransactionDraft,
} from "./operations";
import type { AppData, Budget, Transaction } from "./types";

describe("operations", () => {
  it("creates ids when randomUUID is unavailable", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });

    try {
      expect(createId()).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[\da-f]{4}-[\da-f]{12}$/);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });

  it("blocks deleting referenced categories", () => {
    const data = dataWithBudgetAndTransactions();

    expect(() => deleteEntity(data, "categories", "food")).toThrow("无法删除");
  });

  it("filters transactions by tag and currency", () => {
    const data = dataWithBudgetAndTransactions();
    const rows = filterTransactions(data.transactions, {
      tagIds: ["daily"],
      currency: "CNY",
      startAt: "2026-05-01T00:00:00.000Z",
    });

    expect(rows).toHaveLength(1);
  });

  it("filters transactions by multiple tags and keeps empty tag filters open", () => {
    const data = dataWithBudgetAndTransactions();

    expect(filterTransactions(data.transactions, { tagIds: ["missing", "foreign"] })).toHaveLength(1);
    expect(filterTransactions(data.transactions, { tagIds: [] })).toHaveLength(3);
  });

  it("includes transactions through the selected end date", () => {
    const data = dataWithBudgetAndTransactions();
    const rows = filterTransactions(data.transactions, {
      startAt: "2026-05-02T00:00:00.000Z",
      endAt: "2026-05-02T23:59:59.999Z",
    });

    expect(rows).toHaveLength(2);
  });

  it("calculates budget spending within current period only", () => {
    const data = dataWithBudgetAndTransactions();
    const budget = data.budgets[0];

    expect(budgetPeriodRange(budget, new Date("2026-05-10"))[0]).toBe(new Date(2026, 4, 1).toISOString());
    expect(spendingForBudgetPeriod(data, budget, new Date("2026-05-10"))).toBe(30);
  });

  it("validates transaction drafts before saving", () => {
    const data = dataWithBudgetAndTransactions();
    const result = validateTransactionDraft(data, {
      kind: "transfer",
      accountId: "account",
      amount: 0,
      currency: "CNY",
      occurredAt: "bad-date",
      tagIds: [],
      note: "",
    });

    expect(result.errors).toContain("金额必须大于 0");
    expect(result.errors).toContain("日期无效");
    expect(result.errors).toContain("转账必须选择目标账户");
  });

  it("rejects transaction currencies unsupported by the selected account", () => {
    const base = initialData();
    const result = validateTransactionDraft(base, {
      kind: "expense",
      accountId: base.accounts[0].id,
      amount: 10,
      currency: "USD",
      occurredAt: "2026-05-10T00:00:00.000Z",
      tagIds: [],
      note: "",
    });

    expect(result.errors).toContain("交易币种与账户不匹配");
  });

  it("rejects transfer target currencies unsupported by the target account", () => {
    const base = initialData();
    const target = { ...base.accounts[0], id: "target", currency: "HKD" };
    const result = validateTransactionDraft({ ...base, accounts: [...base.accounts, target] }, {
      kind: "transfer",
      accountId: base.accounts[0].id,
      amount: 10,
      currency: "CNY",
      targetAmount: 11,
      targetCurrency: "USD",
      relatedAccountId: "target",
      occurredAt: "2026-05-10T00:00:00.000Z",
      tagIds: [],
      note: "",
    });

    expect(result.errors).toContain("转入币种与目标账户不匹配");
  });

  it("allows credit card payments without a source account", () => {
    const base = initialData();
    const card = { ...base.accounts[0], id: "card", kind: "credit" as const };
    const cash = { ...base.accounts[0], id: "cash", kind: "cash" as const };
    const result = validateTransactionDraft({ ...base, accounts: [card, cash] }, {
      kind: "credit_payment",
      accountId: "card",
      amount: 100,
      currency: "CNY",
      occurredAt: "2026-05-10T00:00:00.000Z",
      tagIds: [],
      note: "",
    });

    expect(result.errors).toEqual([]);
  });

  it("blocks duplicate generated statements for the same period", () => {
    const base = initialData();
    const account = { ...base.accounts[0], kind: "credit" as const, statementDay: 10 };
    const first = createStatementForAccount({ ...base, accounts: [account] }, account, new Date("2026-05-10"));

    expect(() => createStatementForAccount(first, account, new Date("2026-05-10"))).toThrow("已存在");
  });

  it("blocks deleting currencies bound to a credit card", () => {
    const base = initialData();
    const account = { ...base.accounts[0], kind: "credit" as const, currencyCodes: ["CNY", "USD"] };

    expect(() => deleteCurrency({ ...base, accounts: [account] }, "USD")).toThrow("无法删除");
  });

  it("blocks deleting currencies referenced across ledger records", () => {
    const base = dataWithBudgetAndTransactions();
    const statement = {
      id: "statement",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      accountId: "account",
      startAt: "2026-04-01T00:00:00.000Z",
      endAt: "2026-04-30T23:59:59.000Z",
      primaryCurrency: "HKD",
      paid: false,
    };

    expect(() => deleteCurrency(base, "CNY")).toThrow("无法删除");
    expect(() => deleteCurrency(base, "USD")).toThrow("无法删除");
    expect(() => deleteCurrency({ ...base, statements: [statement] }, "HKD")).toThrow("无法删除");
  });
});

function dataWithBudgetAndTransactions(): AppData {
  const base = initialData();
  const budget: Budget = {
    id: "budget",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    name: "餐饮预算",
    amount: 100,
    currency: "CNY",
    categoryIds: ["food"],
    tagIds: [],
    period: "monthly",
  };
  return {
    ...base,
    categories: [{ ...base.categories[0], id: "food" }],
    tags: [{ ...base.tags[0], id: "daily" }],
    budgets: [budget],
    transactions: [
      transaction("current", "CNY", "2026-05-02T00:00:00.000Z"),
      transaction("old", "CNY", "2026-04-02T00:00:00.000Z"),
      transaction("foreign", "USD", "2026-05-02T00:00:00.000Z", ["foreign"]),
    ],
  };
}

function transaction(
  id: string,
  currency: "CNY" | "USD",
  occurredAt: string,
  tagIds: readonly string[] = ["daily"],
): Transaction {
  return {
    id,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    kind: "expense",
    accountId: "account",
    amount: 30,
    currency,
    occurredAt,
    categoryId: "food",
    tagIds,
    note: id,
  };
}
