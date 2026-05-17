import { describe, expect, it } from "vitest";
import { buildReportIndex } from "../domain/analytics";
import { initialData } from "../domain/factory";
import type { AiSettings, AppData, Category, Tag, Transaction } from "../domain/types";
import { buildAnalysisContext, buildDraftContext } from "./context";

describe("buildDraftContext", () => {
  it("keeps required account and currency context while trimming candidates", () => {
    const data = withLargeCatalog(initialData(), 2_000);
    const context = buildDraftContext(data, { settings: settings(8_000) });

    expect(context.currencies).toEqual(data.currencies);
    expect(context.accounts).toHaveLength(data.accounts.length);
    expect(context.categories.length).toBeLessThan(data.categories.length);
    expect(context.contextMeta.truncated).toBe(true);
    expect(context.contextMeta.estimatedTokens).toBeLessThanOrEqual(8_000);
  });

  it("ranks recently used categories and tags first", () => {
    const data = withRecentUsage(initialData());
    const context = buildDraftContext(data, { settings: settings(32_000) });

    expect(context.categories[0]?.id).toBe("recent-category");
    expect(context.tags[0]?.id).toBe("recent-tag");
  });
});

describe("buildAnalysisContext", () => {
  it("uses report index summaries instead of full transactions", () => {
    const data = withRecentUsage(initialData());
    const context = buildAnalysisContext(data, { settings: settings(32_000), now: new Date("2026-05-18") });
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("\"transactions\"");
    expect(serialized).toContain("退款在报表中以负支出抵扣原支出");
    expect(serialized).not.toContain("统计口径");
    expect(context.selectedRange.currencySummary).toEqual(buildReportIndex(data, { now: new Date("2026-05-18") }).currencySummary);
    expect(context.contextMeta.estimatedTokens).toBeLessThanOrEqual(32_000);
  });
});

function settings(contextTokenBudget: number): AiSettings {
  return {
    provider: "openai-compatible",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "key",
    contextTokenBudget,
  };
}

function withLargeCatalog(data: AppData, count: number): AppData {
  return {
    ...data,
    categories: Array.from({ length: count }, (_unused, index) => category(`category-${index}`)),
    tags: Array.from({ length: count }, (_unused, index) => tag(`tag-${index}`)),
  };
}

function withRecentUsage(data: AppData): AppData {
  const transaction = {
    id: "transaction",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    kind: "expense",
    accountId: data.accounts[0]?.id ?? "",
    amount: 12,
    currency: "CNY",
    occurredAt: "2026-05-18T00:00:00.000Z",
    categoryId: "recent-category",
    tagIds: ["recent-tag"],
    note: "午餐",
  } satisfies Transaction;

  return {
    ...data,
    categories: [category("old-category"), category("recent-category")],
    tags: [tag("old-tag"), tag("recent-tag")],
    transactions: [transaction],
  };
}

function category(id: string): Category {
  return {
    id,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    name: id,
    direction: "expense",
  };
}

function tag(id: string): Tag {
  return {
    id,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    name: id,
  };
}
