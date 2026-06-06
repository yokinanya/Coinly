import { describe, expect, it } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, RecurringRule, Transaction } from "../domain/types";
import { mergeSyncData } from "./syncMerge";

const RUN_AT = "2026-05-01T00:00:00.000Z";
const NEXT_RUN_AT = "2026-06-01T00:00:00.000Z";

describe("sync merge", () => {
  it("keeps one transaction when two devices materialize the same recurring occurrence", () => {
    const base = initialData();
    const local = withRecurringState(base, {
      updatedAt: "2026-05-02T00:00:00.000Z",
      nextRunAt: NEXT_RUN_AT,
      transactions: [recurringTransaction(base, "local-recurring", "2026-05-02T00:00:00.000Z")],
    });
    const remote = withRecurringState(base, {
      updatedAt: "2026-05-03T00:00:00.000Z",
      nextRunAt: NEXT_RUN_AT,
      transactions: [recurringTransaction(base, "remote-recurring", "2026-05-03T00:00:00.000Z")],
    });

    const result = mergeSyncData(local, [remote]);

    expect(result.data?.transactions).toHaveLength(1);
    expect(result.data?.transactions[0]).toMatchObject({
      id: "remote-recurring",
      sourceRecurringRuleId: "recurring-rule",
      occurredAt: RUN_AT,
    });
  });

  it("does not restore a recurring transaction deleted after its rule advanced", () => {
    const base = initialData();
    const local = withRecurringState(base, {
      updatedAt: "2026-05-04T00:00:00.000Z",
      nextRunAt: NEXT_RUN_AT,
      transactions: [],
    });
    const remote = withRecurringState(base, {
      updatedAt: "2026-05-03T00:00:00.000Z",
      nextRunAt: NEXT_RUN_AT,
      transactions: [recurringTransaction(base, "remote-recurring", "2026-05-03T00:00:00.000Z")],
    });

    const result = mergeSyncData(local, [remote]);

    expect(result.data?.transactions).toEqual([]);
  });

  it("keeps a remote recurring transaction when the local rule has not reached that occurrence", () => {
    const base = initialData();
    const local = withRecurringState(base, {
      updatedAt: "2026-04-30T00:00:00.000Z",
      nextRunAt: RUN_AT,
      transactions: [],
    });
    const remote = withRecurringState(base, {
      updatedAt: "2026-05-03T00:00:00.000Z",
      nextRunAt: NEXT_RUN_AT,
      transactions: [recurringTransaction(base, "remote-recurring", "2026-05-03T00:00:00.000Z")],
    });

    const result = mergeSyncData(local, [remote]);

    expect(result.data?.transactions.map((transaction) => transaction.id)).toEqual(["remote-recurring"]);
  });

  it("rewrites refund references when recurring duplicates are merged", () => {
    const base = initialData();
    const local = withRecurringState(base, {
      updatedAt: "2026-05-02T00:00:00.000Z",
      nextRunAt: NEXT_RUN_AT,
      transactions: [
        recurringTransaction(base, "local-recurring", "2026-05-02T00:00:00.000Z"),
        refundTransaction(base, "local-refund", "local-recurring", "2026-05-02T01:00:00.000Z"),
      ],
    });
    const remote = withRecurringState(base, {
      updatedAt: "2026-05-03T00:00:00.000Z",
      nextRunAt: NEXT_RUN_AT,
      transactions: [recurringTransaction(base, "remote-recurring", "2026-05-03T00:00:00.000Z")],
    });

    const result = mergeSyncData(local, [remote]);

    expect(result.data?.transactions.map((transaction) => [transaction.id, transaction.refundOfTransactionId])).toEqual([
      ["local-refund", "remote-recurring"],
      ["remote-recurring", undefined],
    ]);
  });
});

function withRecurringState(
  data: AppData,
  options: {
    readonly updatedAt: string;
    readonly nextRunAt: string;
    readonly transactions: readonly Transaction[];
  },
): AppData {
  return {
    ...data,
    updatedAt: options.updatedAt,
    localVersion: data.localVersion + 1,
    recurringRules: [recurringRule(data, options.nextRunAt, options.updatedAt)],
    transactions: options.transactions,
  };
}

function recurringRule(data: AppData, nextRunAt: string, updatedAt: string): RecurringRule {
  return {
    id: "recurring-rule",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt,
    name: "订阅",
    enabled: true,
    interval: "monthly",
    nextRunAt,
    transaction: {
      kind: "expense",
      accountId: data.accounts[0].id,
      amount: 10,
      currency: data.accounts[0].currency,
      occurredAt: RUN_AT,
      tagIds: [],
      note: "订阅",
    },
  };
}

function recurringTransaction(data: AppData, id: string, updatedAt: string): Transaction {
  return {
    id,
    createdAt: RUN_AT,
    updatedAt,
    kind: "expense",
    accountId: data.accounts[0].id,
    amount: 10,
    currency: data.accounts[0].currency,
    occurredAt: RUN_AT,
    tagIds: [],
    note: "订阅",
    sourceRecurringRuleId: "recurring-rule",
  };
}

function refundTransaction(data: AppData, id: string, refundOfTransactionId: string, updatedAt: string): Transaction {
  return {
    id,
    createdAt: updatedAt,
    updatedAt,
    kind: "refund",
    accountId: data.accounts[0].id,
    amount: 5,
    currency: data.accounts[0].currency,
    occurredAt: updatedAt,
    tagIds: [],
    note: "退款",
    refundOfTransactionId,
  };
}