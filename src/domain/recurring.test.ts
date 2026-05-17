import { describe, expect, it } from "vitest";
import { initialData } from "./factory";
import {
  accountCurrencyOptions,
  currencyForAccount,
  defaultNextRunAt,
  earliestAllowedStartAt,
  materializeDueRecurring,
  validateRecurringRule,
} from "./recurring";
import type { Account, AppData, RecurringRule } from "./types";

describe("recurring rules", () => {
  it("limits recurring currencies to the selected non-credit account currency", () => {
    const account = accountFixture({ kind: "wechat", currency: "CNY", currencyCodes: ["CNY", "USD"] });

    expect(accountCurrencyOptions(account)).toEqual(["CNY"]);
  });

  it("uses configured credit card currencies", () => {
    const account = accountFixture({ kind: "credit", currency: "CNY", currencyCodes: ["CNY", "USD"] });

    expect(accountCurrencyOptions(account)).toEqual(["CNY", "USD"]);
  });

  it("uses the primary credit currency when no extra currencies are configured", () => {
    const account = accountFixture({ kind: "credit", currency: "HKD", currencyCodes: undefined });

    expect(accountCurrencyOptions(account)).toEqual(["HKD"]);
  });

  it("chooses a valid currency when switching recurring accounts", () => {
    const account = accountFixture({ kind: "credit", currency: "CNY", currencyCodes: ["CNY", "USD"] });
    const cash = accountFixture({ kind: "wechat", currency: "HKD" });

    expect(currencyForAccount(account, "USD")).toBe("USD");
    expect(currencyForAccount(cash, "USD")).toBe("HKD");
  });

  it("rejects recurring rules with missing accounts or unsupported currencies", () => {
    const data = initialData();
    const rule = recurringRule(data);

    expect(() => validateRecurringRule(data, { ...rule, transaction: { ...rule.transaction, accountId: "missing" } }))
      .toThrow("支付方式不存在");
    expect(() => validateRecurringRule(data, { ...rule, transaction: { ...rule.transaction, currency: "USD" } }))
      .toThrow("支付币种与支付方式不匹配");
  });

  it("rejects invalid dates and dates earlier than one month ago", () => {
    const data = initialData();
    const now = new Date("2026-05-18T12:00:00.000Z");
    const rule = recurringRule(data);

    expect(() => validateRecurringRule(data, { ...rule, nextRunAt: "bad-date" }, now)).toThrow("开始日期无效");
    expect(() => validateRecurringRule(data, { ...rule, nextRunAt: "2026-04-17T00:00:00.000Z" }, now))
      .toThrow("开始日期不能早于一个月前");
    expect(() => validateRecurringRule(data, { ...rule, nextRunAt: earliestAllowedStartAt(now) }, now)).not.toThrow();
  });

  it("generates default next run dates for monthly and yearly subscriptions", () => {
    const now = new Date("2026-05-18T12:00:00.000Z");

    expect(defaultNextRunAt("monthly", now)).toBe(new Date(2026, 5, 18).toISOString());
    expect(defaultNextRunAt("yearly", now)).toBe(new Date(2027, 4, 18).toISOString());
  });

  it("materializes due monthly and yearly rules and advances their next dates", () => {
    const base = initialData();
    const data: AppData = {
      ...base,
      recurringRules: [
        recurringRule(base, { id: "monthly", interval: "monthly", nextRunAt: "2026-05-01T00:00:00.000Z" }),
        recurringRule(base, { id: "yearly", interval: "yearly", nextRunAt: "2026-05-02T00:00:00.000Z" }),
      ],
    };

    const next = materializeDueRecurring(data, new Date("2026-05-18T00:00:00.000Z"));

    expect(next.transactions.map((transaction) => transaction.sourceRecurringRuleId)).toEqual(["monthly", "yearly"]);
    expect(next.recurringRules.map((rule) => rule.nextRunAt)).toEqual([
      "2026-06-01T00:00:00.000Z",
      "2027-05-02T00:00:00.000Z",
    ]);
  });
});

function accountFixture(patch: Partial<Account>): Account {
  const base = initialData().accounts[0];
  return { ...base, ...patch };
}

function recurringRule(data: AppData, patch: Partial<RecurringRule> = {}): RecurringRule {
  const timestamp = "2026-05-18T00:00:00.000Z";
  return {
    id: patch.id ?? "rule",
    createdAt: timestamp,
    updatedAt: timestamp,
    name: "订阅",
    enabled: true,
    interval: patch.interval ?? "monthly",
    nextRunAt: patch.nextRunAt ?? timestamp,
    transaction: {
      kind: "expense",
      accountId: data.accounts[0].id,
      amount: 10,
      currency: data.accounts[0].currency,
      occurredAt: timestamp,
      tagIds: [],
      note: "",
      ...patch.transaction,
    },
  };
}
