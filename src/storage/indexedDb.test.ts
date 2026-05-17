import { describe, expect, it } from "vitest";
import { APP_SCHEMA_VERSION, initialData } from "../domain/factory";
import { isSameAppData, migrateData, parseImportedData, previewImportedData } from "./indexedDb";

describe("indexedDb data validation", () => {
  it("adds schema and ui defaults when migrating older data", () => {
    const data = migrateData({ ...initialData(), schemaVersion: undefined as unknown as number });

    expect(data.schemaVersion).toBe(APP_SCHEMA_VERSION);
    expect(data.uiSettings?.theme).toBe("system");
  });

  it("rejects invalid imported data", () => {
    expect(() => parseImportedData(JSON.stringify({ transactions: [] }))).toThrow("导入文件不是有效的 Coinly 数据");
  });

  it("previews valid imports without changing the payload", () => {
    const data = initialData();
    const preview = previewImportedData(JSON.stringify(data));

    expect(preview.data.localVersion).toBe(data.localVersion);
    expect(preview.summary).toMatchObject({
      accounts: data.accounts.length,
      transactions: data.transactions.length,
      currencies: data.currencies.length,
    });
  });

  it("rejects imports with wrong schema or incomplete entities", () => {
    expect(() => parseImportedData(JSON.stringify({ ...initialData(), schemaVersion: 999 }))).toThrow("导入文件不是有效的 Coinly 数据");
    expect(() => parseImportedData(JSON.stringify({ ...initialData(), accounts: [{ id: "a" }] }))).toThrow("导入文件不是有效的 Coinly 数据");
  });

  it("rejects imported transactions with missing references", () => {
    const data = {
      ...initialData(),
      transactions: [{
        id: "tx",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        kind: "expense",
        accountId: "missing",
        amount: 10,
        currency: "CNY",
        occurredAt: "2026-01-01T00:00:00.000Z",
        categoryId: "missing-category",
        tagIds: ["missing-tag"],
        note: "",
      }],
    };

    expect(() => parseImportedData(JSON.stringify(data))).toThrow("数据校验失败");
  });

  it("rejects imported budgets with missing currencies", () => {
    const base = initialData();
    const data = {
      ...base,
      budgets: [{
        id: "budget",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        name: "预算",
        amount: 100,
        currency: "AUD",
        categoryIds: [],
        tagIds: [],
        period: "monthly",
      }],
    };

    expect(() => parseImportedData(JSON.stringify(data))).toThrow("预算 budget 引用不存在的币种 AUD");
  });

  it("rejects imported statements with non-credit accounts", () => {
    const base = initialData();
    const data = {
      ...base,
      statements: [{
        id: "statement",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        accountId: base.accounts[0].id,
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-01-31T23:59:59.000Z",
        primaryCurrency: "CNY",
        paid: false,
      }],
    };

    expect(() => parseImportedData(JSON.stringify(data))).toThrow("引用不存在的信用卡账户");
  });

  it("rejects imported recurring rules with missing accounts", () => {
    const data = {
      ...initialData(),
      recurringRules: [{
        id: "rule",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        name: "订阅",
        enabled: true,
        interval: "monthly",
        nextRunAt: "2026-02-01T00:00:00.000Z",
        transaction: {
          kind: "expense",
          accountId: "missing",
          amount: 10,
          currency: "CNY",
          occurredAt: "2026-01-01T00:00:00.000Z",
          tagIds: [],
          note: "",
        },
      }],
    };

    expect(() => parseImportedData(JSON.stringify(data))).toThrow("订阅规则 rule 引用不存在的账户 missing");
  });

  it("rejects imported recurring rules with unsupported intervals", () => {
    const base = initialData();
    const data = {
      ...base,
      recurringRules: [{
        id: "rule",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        name: "订阅",
        enabled: true,
        interval: "daily",
        nextRunAt: "2026-02-01T00:00:00.000Z",
        transaction: {
          kind: "expense",
          accountId: base.accounts[0].id,
          amount: 10,
          currency: "CNY",
          occurredAt: "2026-01-01T00:00:00.000Z",
          tagIds: [],
          note: "",
        },
      }],
    };

    expect(() => parseImportedData(JSON.stringify(data))).toThrow("周期不受支持");
  });

  it("treats identical app data as unchanged", () => {
    const data = initialData();

    expect(isSameAppData(data, structuredClone(data))).toBe(true);
  });

  it("treats content changes as real updates even when structure is similar", () => {
    const data = initialData();
    const changed = { ...data, updatedAt: new Date(Date.parse(data.updatedAt) + 1_000).toISOString() };

    expect(isSameAppData(data, changed)).toBe(false);
  });
});
