import { describe, expect, it } from "vitest";
import { initialData } from "./factory";
import { monthlyTrends, reportEntries, spendingForBudget, summarizeByCategory, summarizeByCurrency, summarizeByTag } from "./analytics";
import type { ReportEntry } from "./analytics";
import type { AppData, Transaction } from "./types";

describe("summarizeByCurrency", () => {
  it("keeps currencies separated without implicit exchange", () => {
    const entries: readonly ReportEntry[] = [
      makeEntry(100, "CNY", "income"),
      makeEntry(10, "USD", "expense"),
    ];

    expect(summarizeByCurrency(entries)).toEqual([
      { currency: "CNY", income: 100, expense: 0 },
      { currency: "USD", income: 0, expense: 10 },
    ]);
  });

  it("excludes unbilled credit expenses from report entries", () => {
    const data = creditFixture(false);

    expect(summarizeByCurrency(reportEntries(data))).toEqual([]);
  });

  it("allocates settled credit statements into the settlement currency", () => {
    const data = creditFixture(true);

    expect(summarizeByCurrency(reportEntries(data))).toEqual([
      { currency: "CNY", income: 0, expense: 140 },
    ]);
    expect(summarizeByCategory(data)).toEqual([
      { categoryId: "food", currency: "CNY", amount: 105 },
      { categoryId: "travel", currency: "CNY", amount: 35 },
    ]);
  });

  it("allocates settled credit statements into budget and tag summaries", () => {
    const data = creditFixture(true);

    expect(spendingForBudget(data, "food-budget")).toBe(105);
    expect(summarizeByCurrency(reportEntries(data).filter((entry) => entry.tagIds.includes("daily")))).toEqual([
      { currency: "CNY", income: 0, expense: 105 },
    ]);
  });

  it("builds monthly trends by original currency without exchange", () => {
    const base = initialData();
    const data = {
      ...base,
      transactions: [
        { ...makeTransaction(base.accounts[0].id, 100, "CNY", "income"), occurredAt: "2026-02-01T00:00:00.000Z" },
        { ...makeTransaction(base.accounts[0].id, 12, "USD", "expense"), occurredAt: "2026-02-02T00:00:00.000Z" },
      ],
    };

    expect(monthlyTrends(data, 1, new Date("2026-02-15T00:00:00.000Z"))).toEqual([
      { month: "2026-02", currency: "CNY", income: 100, expense: 0 },
      { month: "2026-02", currency: "USD", income: 0, expense: 12 },
    ]);
  });

  it("summarizes tags using settled statement entries", () => {
    const data = creditFixture(true);

    expect(summarizeByTag(data)).toEqual([
      { tagId: "daily", currency: "CNY", amount: 105 },
    ]);
  });

  it("treats refunds as expense reductions instead of income", () => {
    const base = initialData();
    const categoryId = base.categories.find((category) => category.direction === "expense")?.id;
    const data = {
      ...base,
      transactions: [
        { ...makeTransaction(base.accounts[0].id, 100, "CNY", "expense"), id: "expense", categoryId },
        {
          ...makeTransaction(base.accounts[0].id, 40, "CNY", "expense"),
          id: "refund",
          kind: "refund" as const,
          categoryId,
          refundOfTransactionId: "expense",
        },
      ],
    };

    expect(summarizeByCurrency(reportEntries(data))).toEqual([
      { currency: "CNY", income: 0, expense: 60 },
    ]);
    expect(summarizeByCategory(data)).toEqual([
      { categoryId: categoryId ?? "", currency: "CNY", amount: 60 },
    ]);
  });
});

function makeTransaction(
  accountId: string,
  amount: number,
  currency: "CNY" | "USD" | "HKD",
  kind: "income" | "expense",
): Transaction {
  return {
    id: crypto.randomUUID(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    accountId,
    amount,
    currency,
    kind,
    occurredAt: "2026-01-01T00:00:00.000Z",
    tagIds: [],
    note: "",
  };
}

function makeEntry(
  amount: number,
  currency: "CNY" | "USD",
  kind: "income" | "expense",
): ReportEntry {
  return {
    amount,
    currency,
    kind,
    occurredAt: "2026-01-01T00:00:00.000Z",
    tagIds: [],
  };
}

function creditFixture(paid: boolean): AppData {
  const base = initialData();
  const card = { ...base.accounts[0], id: "card", kind: "credit" as const, currency: "CNY" };
  return {
    ...base,
    accounts: [card],
    categories: [
      { ...base.categories[0], id: "food" },
      { ...base.categories[0], id: "travel", name: "旅行" },
    ],
    tags: [{ ...base.tags[0], id: "daily" }],
    budgets: [{
      id: "food-budget",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      name: "餐饮预算",
      amount: 500,
      currency: "CNY",
      categoryIds: ["food"],
      tagIds: [],
      period: "monthly",
    }],
    statements: [{
      id: "statement",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      accountId: "card",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-01-31T23:59:59.000Z",
      primaryCurrency: "CNY",
      paid,
      settlementAmount: paid ? 140 : undefined,
      settlementCurrency: paid ? "CNY" : undefined,
      settledAt: paid ? "2026-02-05T00:00:00.000Z" : undefined,
    }],
    transactions: [
      { ...makeTransaction("card", 30, "USD", "expense"), categoryId: "food", tagIds: ["daily"] },
      { ...makeTransaction("card", 10, "HKD", "expense"), categoryId: "travel", currency: "HKD" },
    ],
  };
}
