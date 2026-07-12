import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, RecurringRule } from "../domain/types";
import { RecurringView } from "./RecurringView";
import { summarizeRecurringRules } from "./recurringSummary";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-12T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RecurringView", () => {
  it("summarizes enabled upcoming rules by currency within 30 days", () => {
    const data = recurringData();

    expect(summarizeRecurringRules(data.recurringRules, new Date("2026-07-12T12:00:00.000Z"))).toEqual({
      enabledCount: 3,
      upcomingCount: 2,
      amounts: [
        { currency: "CNY", amount: 30 },
        { currency: "USD", amount: 8 },
      ],
    });
  });

  it("shows summary cards and visually explicit rule states", () => {
    render(<RecurringView data={recurringData()} setData={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "订阅", level: 1 })).toBeTruthy();
    const summary = screen.getByRole("region", { name: "订阅概览" });
    expect(summary.textContent).toContain("3");
    expect(summary.textContent).toContain("2 笔");
    expect(summary.textContent).toContain("¥30.00");
    expect(summary.textContent).toContain("US$8.00");
    expect(screen.getAllByText("启用")).toHaveLength(3);
    expect(screen.getByText("已停用")).toBeTruthy();
    expect(screen.getByText("每月 · 原定 2026/7/20")).toBeTruthy();
  });

  it("opens create and edit drawers and saves an edited rule", () => {
    const setData = vi.fn();
    render(<RecurringView data={recurringData()} setData={setData} />);

    fireEvent.click(screen.getByRole("button", { name: "新建订阅" }));
    expect(screen.getByRole("dialog", { name: "新建订阅" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getByRole("button", { name: "编辑房租" }));
    expect(screen.getByRole("dialog", { name: "编辑订阅" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "名称" }), { target: { value: "新房租" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const saved = setData.mock.calls[0][0] as AppData;
    expect(saved.recurringRules.find((rule) => rule.id === "rent")?.name).toBe("新房租");
  });

  it("requires confirmation before deleting a rule", () => {
    const setData = vi.fn();
    render(<RecurringView data={recurringData()} setData={setData} />);

    fireEvent.click(screen.getByRole("button", { name: "删除房租" }));
  expect(screen.getByRole("dialog", { name: "确认删除" }).textContent).toContain("已生成的历史交易不会被删除");
    expect(setData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    const saved = setData.mock.calls[0][0] as AppData;
    expect(saved.recurringRules.some((rule) => rule.id === "rent")).toBe(false);
  });
});

function recurringData(): AppData {
  const base = initialData();
  return {
    ...base,
    recurringRules: [
      recurringRule(base, { id: "rent", name: "房租", amount: 30, currency: "CNY", nextRunAt: "2026-07-12T00:00:00.000Z" }),
      recurringRule(base, { id: "server", name: "服务器", amount: 8, currency: "USD", nextRunAt: "2026-08-11T00:00:00.000Z" }),
      recurringRule(base, { id: "future", name: "远期会员", amount: 50, currency: "CNY", nextRunAt: "2026-08-12T00:00:00.000Z" }),
      recurringRule(base, { id: "paused", name: "暂停会员", amount: 12, currency: "CNY", nextRunAt: "2026-07-20T00:00:00.000Z", enabled: false }),
    ],
  };
}

function recurringRule(
  data: AppData,
  values: { readonly id: string; readonly name: string; readonly amount: number; readonly currency: string; readonly nextRunAt: string; readonly enabled?: boolean },
): RecurringRule {
  return {
    id: values.id,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    name: values.name,
    enabled: values.enabled ?? true,
    interval: "monthly",
    nextRunAt: values.nextRunAt,
    transaction: {
      kind: "expense",
      accountId: data.accounts[0].id,
      amount: values.amount,
      currency: values.currency,
      occurredAt: values.nextRunAt,
      tagIds: [],
      note: values.name,
    },
  };
}