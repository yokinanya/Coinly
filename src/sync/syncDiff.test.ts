import { describe, expect, it } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData } from "../domain/types";
import { summarizeSyncDiff } from "./syncDiff";

const DAY_MS = 86_400_000;

describe("sync diff summary", () => {
  it("counts additions and newer entities without expanding full details", () => {
    const base = initialData();
    const local = withAccountName(withTransaction(base, "local-transaction", 1), "本地账户", 2);
    const remote = withTransaction(base, "remote-transaction", 3);

    const summary = summarizeSyncDiff(local, remote);
    const accounts = summary.collections.find((item) => item.key === "accounts");
    const transactions = summary.collections.find((item) => item.key === "transactions");

    expect(accounts?.localNewer).toBe(1);
    expect(transactions?.localOnly).toBe(1);
    expect(transactions?.remoteOnly).toBe(1);
  });

  it("counts same-time content conflicts", () => {
    const local = withAccountName(initialData(), "本地账户", 1);
    const remote = { ...local, accounts: [{ ...local.accounts[0], name: "远端账户" }] };

    const summary = summarizeSyncDiff(local, remote);
    const accounts = summary.collections.find((item) => item.key === "accounts");

    expect(accounts?.sameTimeConflicts).toBe(1);
  });

  it("counts currency differences separately", () => {
    const local = { ...initialData(), currencies: ["CNY", "USD"] };
    const remote = { ...local, currencies: ["CNY", "JPY"] };

    const summary = summarizeSyncDiff(local, remote);

    expect(summary.currencyLocalOnly).toBe(1);
    expect(summary.currencyRemoteOnly).toBe(1);
  });
});

function withAccountName(data: AppData, name: string, days: number): AppData {
  const updatedAt = offsetTime(data.updatedAt, days);
  return {
    ...data,
    updatedAt,
    accounts: [{ ...data.accounts[0], name, updatedAt }],
  };
}

function withTransaction(data: AppData, id: string, days: number): AppData {
  const updatedAt = offsetTime(data.updatedAt, days);
  return {
    ...data,
    updatedAt,
    transactions: [{
      id,
      createdAt: updatedAt,
      updatedAt,
      kind: "expense",
      accountId: data.accounts[0].id,
      amount: 10,
      currency: data.accounts[0].currency,
      occurredAt: updatedAt,
      tagIds: [],
      note: id,
    }],
  };
}

function offsetTime(value: string, days: number): string {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}
