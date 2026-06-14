import { describe, expect, it } from "vitest";
import { initialData } from "./factory";
import { buildReportIndex, monthlyTrends, reportEntries, spendingForBudget, summarizeByCategory, summarizeByCurrency, summarizeByTag } from "./analytics";
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

  it("includes credit expenses by original currency before settlement", () => {
    const data = creditFixture(false);

    expect(summarizeByCurrency(reportEntries(data))).toEqual([
      { currency: "HKD", income: 0, expense: 10 },
      { currency: "USD", income: 0, expense: 30 },
    ]);
  });

  it("keeps settled credit statements in original transaction currencies", () => {
    const data = creditFixture(true);

    expect(summarizeByCurrency(reportEntries(data))).toEqual([
      { currency: "HKD", income: 0, expense: 10 },
      { currency: "USD", income: 0, expense: 30 },
    ]);
    expect(summarizeByCategory(data)).toEqual([
      { categoryId: "food", currency: "USD", amount: 30 },
      { categoryId: "travel", currency: "HKD", amount: 10 },
    ]);
  });

  it("uses original credit transaction currencies in budget and tag summaries", () => {
    const data = creditFixture(true);

    expect(spendingForBudget(data, "food-budget")).toBe(30);
    expect(summarizeByCurrency(reportEntries(data).filter((entry) => entry.tagIds.includes("daily")))).toEqual([
      { currency: "USD", income: 0, expense: 30 },
    ]);
  });

  it("reduces budget spending with configured offset income categories", () => {
    const base = initialData();
    const expenseCategory = { ...base.categories[0], id: "food", direction: "expense" as const };
    const offsetCategory = { ...base.categories.find((category) => category.direction === "income"), id: "resale", name: "出售二手", direction: "income" as const };
    const data = {
      ...base,
      categories: [expenseCategory, offsetCategory].filter(Boolean) as AppData["categories"],
      budgets: [{
        id: "food-budget",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        name: "餐饮预算",
        amount: 500,
        currency: "CNY",
        categoryIds: ["food"],
        tagIds: [],
        offsetCategoryIds: ["resale"],
        period: "monthly",
      }],
      transactions: [
        { ...makeTransaction(base.accounts[0].id, 30, "CNY", "expense"), categoryId: "food" },
        { ...makeTransaction(base.accounts[0].id, 10, "CNY", "income"), categoryId: "resale" },
      ],
    };

    expect(spendingForBudget(data, "food-budget")).toBe(20);
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

  it("summarizes tags using original credit transaction entries", () => {
    const data = creditFixture(true);

    expect(summarizeByTag(data)).toEqual([
      { tagId: "daily", currency: "USD", amount: 30 },
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

  it("builds a reusable report index matching standalone summaries", () => {
    const data = creditFixture(true);
    const now = new Date("2026-01-15T00:00:00.000Z");
    const entries = reportEntries(data);
    const index = buildReportIndex(data, { now, trendMonths: 2 });

    expect(index.entries).toEqual(entries);
    expect(index.currentMonthEntries).toEqual(entries);
    expect(index.currencySummary).toEqual(summarizeByCurrency(entries));
    expect(index.categorySummary).toEqual(summarizeByCategory(data, entries));
    expect(index.tagSummary).toEqual(summarizeByTag(data, entries));
    expect(index.monthlyTrends).toEqual(monthlyTrends(data, 2, now));
  });

  it("indexes tag spending across multiple tags, currencies, refunds, and credit transactions", () => {
    const base = creditFixture(true);
    const cash = { ...base.accounts[0], id: "cash", kind: "cash" as const };
    const data = {
      ...base,
      accounts: [...base.accounts, cash],
      tags: [{ id: "daily", name: "日常", createdAt: base.updatedAt, updatedAt: base.updatedAt }],
      transactions: [
        ...base.transactions,
        { ...makeTransaction("cash", 20, "USD", "expense"), tagIds: ["daily"], occurredAt: "2026-02-10T00:00:00.000Z" },
        { ...makeTransaction("cash", 5, "USD", "expense"), kind: "refund" as const, tagIds: ["daily"], occurredAt: "2026-02-11T00:00:00.000Z" },
      ],
    };

    expect(buildReportIndex(data, { now: new Date("2026-02-15T00:00:00.000Z") }).tagSummary).toEqual([
      { tagId: "daily", currency: "USD", amount: 15 },
    ]);
  });

  it("shows current month JPY credit expenses in the currency summary", () => {
    const base = initialData();
    const card = { ...base.accounts[0], id: "card", kind: "credit" as const, currency: "JPY" };
    const data = {
      ...base,
      accounts: [card],
      transactions: [
        { ...makeTransaction("card", 1200, "JPY", "expense"), occurredAt: "2026-05-10T00:00:00.000Z" },
      ],
    };

    expect(buildReportIndex(data, { now: new Date("2026-05-20T00:00:00.000Z") }).currencySummary).toEqual([
      { currency: "JPY", income: 0, expense: 1200 },
    ]);
  });
});

function makeTransaction(
  accountId: string,
  amount: number,
  currency: "CNY" | "USD" | "HKD" | "JPY",
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
