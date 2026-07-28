import { describe, expect, it } from "vitest";
import { createTransaction, initialData } from "../domain/factory";
import type { AppData, TransactionDraft } from "../domain/types";
import { executeLedgerQuery, parseLedgerQuery } from "./ledgerQuery";

describe("ledgerQuery", () => {
  it("filters the complete ledger and groups exact multi-currency totals", () => {
    const data = ledger();
    const query = parseLedgerQuery({
      startAt: "2025-01-01",
      endAt: "2025-12-31",
      metric: "sum",
      groupBy: "currency",
    });

    const result = executeLedgerQuery(data, query);

    expect(result.complete).toBe(true);
    expect(result.matchedCount).toBe(2);
    expect(result.amountByCurrency).toEqual({ CNY: -38, USD: -12 });
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "CNY", count: 1, amountByCurrency: { CNY: -38 } }),
      expect.objectContaining({ key: "USD", count: 1, amountByCurrency: { USD: -12 } }),
    ]));
  });

  it("rejects unknown fields and invalid ranges", () => {
    expect(() => parseLedgerQuery({ question: "餐饮", metric: "sum", groupBy: "none" })).toThrow("未知字段");
    expect(() => parseLedgerQuery({
      startAt: "2026-02-01",
      endAt: "2026-01-01",
      metric: "sum",
      groupBy: "none",
    })).toThrow("不能晚于");
  });
});

function ledger(): AppData {
  const data = initialData();
  return {
    ...data,
    currencies: ["CNY", "USD"],
    transactions: [
      transaction(data, { amount: 38, currency: "CNY", occurredAt: "2025-06-01" }),
      transaction(data, { amount: 12, currency: "USD", occurredAt: "2025-12-31T23:59:59.000Z" }),
      transaction(data, { amount: 50, currency: "CNY", occurredAt: "2026-01-01" }),
    ],
  };
}

function transaction(data: AppData, patch: Partial<TransactionDraft>) {
  return createTransaction({
    kind: "expense",
    accountId: data.accounts[0].id,
    amount: 1,
    currency: "CNY",
    occurredAt: "2025-01-01",
    tagIds: [],
    note: "",
    ...patch,
  });
}
