import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, CreditCardStatement, Transaction } from "../domain/types";
import { CreditStatementsView } from "./CreditStatementsView";

describe("CreditStatementsView", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows latest-month combined statement stats and updates when month changes", async () => {
    render(<CreditStatementsView data={statementData()} setData={vi.fn()} onBack={vi.fn()} />);

    const overview = panelByHeading("账期概览");
    expect(within(overview).getByText("2026年2月")).toBeTruthy();
    expect(within(overview).getByText("1 条")).toBeTruthy();
    expect(within(panelByHeading("金额汇总")).getByText(/80\.00/)).toBeTruthy();

    fireEvent.click(within(overview).getByRole("button", { name: "账期月份" }));
    fireEvent.click(screen.getByRole("option", { name: "2026年1月" }));

    await waitFor(() => expect(within(overview).getByText("2026年1月")).toBeTruthy());
    expect(within(overview).getByText("3 条")).toBeTruthy();
    const summary = panelByHeading("金额汇总");
    expect(within(summary).getByText(/150\.00/)).toBeTruthy();
    expect(within(summary).getByText(/20\.00/)).toBeTruthy();
  });

  it("creates one combined statement for the selected credit cards", () => {
    const setData = vi.fn();
    render(<CreditStatementsView data={statementData({ statements: [], transactions: [] })} setData={setData} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "生成账单" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "合并生成账单" })).getByRole("button", { name: "生成账单" }));

    expect(setData).toHaveBeenCalledTimes(1);
    const next = setData.mock.calls[0][0] as AppData;
    expect(next.statements).toHaveLength(1);
    expect(next.statements[0]).toMatchObject({
      accountId: "card-a",
      accountIds: ["card-a", "card-b"],
      paid: false,
    });
  });

  it("dismisses generated success messages automatically", () => {
    vi.useFakeTimers();
    const setData = vi.fn();
    render(<CreditStatementsView data={statementData({ statements: [], transactions: [] })} setData={setData} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "生成账单" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "合并生成账单" })).getByRole("button", { name: "生成账单" }));

    expect(screen.getByText("合并账单已生成")).toBeTruthy();
    act(() => vi.advanceTimersByTime(3200));
    expect(screen.queryByText("合并账单已生成")).toBeNull();
  });

  it("creates the selected single-card statement from the compact generator", () => {
    const setData = vi.fn();
    render(<CreditStatementsView data={statementData({ statements: [], transactions: [] })} setData={setData} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "账单对象" }));
    fireEvent.click(screen.getByRole("option", { name: /主卡 \d+月账单/ }));
    fireEvent.click(screen.getByRole("button", { name: "生成账单" }));

    expect(setData).toHaveBeenCalledTimes(1);
    const next = setData.mock.calls[0][0] as AppData;
    expect(next.statements).toHaveLength(1);
    expect(next.statements[0]).toMatchObject({ accountId: "card-a", paid: false });
    expect(next.statements[0].accountIds).toBeUndefined();
  });

  it("saves a first-month statement adjustment from the bank statement total", () => {
    const setData = vi.fn();
    render(<CreditStatementsView data={statementData({
      statements: [statement("feb-card-a", "card-a", "2026-02-28T23:59:59.000Z", false)],
      transactions: [transaction("feb-card-a", "card-a", 80, "CNY", "2026-02-12T00:00:00.000Z")],
    })} setData={setData} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "历史补差" }));
    fireEvent.change(screen.getByLabelText("银行账单总额"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "保存补差" }));

    expect(setData).toHaveBeenCalledTimes(1);
    const next = setData.mock.calls[0][0] as AppData;
    expect(next.transactions).toHaveLength(1);
    expect(next.statements[0].adjustments).toMatchObject([
      { accountId: "card-a", amount: 40, currency: "CNY", note: "历史消费补差" },
    ]);
  });

  it("limits statement adjustment currencies to the selected card", () => {
    render(<CreditStatementsView data={statementData({ statements: [combinedStatement()], transactions: [] })} setData={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "历史补差" }));
    fireEvent.click(screen.getByRole("button", { name: "信用卡" }));
    fireEvent.click(screen.getByRole("option", { name: "副卡" }));
    fireEvent.click(screen.getByRole("button", { name: "币种" }));

    expect(screen.queryByRole("option", { name: "USD" })).toBeNull();
    expect(screen.getByRole("option", { name: "JPY" })).toBeTruthy();
  });

  it("saves bank CNY billing amounts for each card in a combined statement", () => {
    const setData = vi.fn();
    render(<CreditStatementsView data={statementData({ statements: [combinedStatement()] })} setData={setData} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "银行账单" }));
    fireEvent.change(screen.getByLabelText("主卡 银行出账金额（CNY）"), { target: { value: "812.34" } });
    fireEvent.change(screen.getByLabelText("副卡 银行出账金额（CNY）"), { target: { value: "321" } });
    fireEvent.click(screen.getByRole("button", { name: "保存出账金额" }));

    expect(setData).toHaveBeenCalledTimes(1);
    const next = setData.mock.calls[0][0] as AppData;
    expect(next.statements[0].billingAmounts).toMatchObject([
      { accountId: "card-a", amount: 812.34, currency: "CNY" },
      { accountId: "card-b", amount: 321, currency: "CNY" },
    ]);
  });

  it("previews combined settlement by bank CNY billing amounts", () => {
    render(<CreditStatementsView data={statementData({
      statements: [{
        ...combinedStatement(),
        billingAmounts: [
          { id: "billing-a", accountId: "card-a", amount: 812.34, currency: "CNY", note: "银行账单出账金额" },
          { id: "billing-b", accountId: "card-b", amount: 321, currency: "CNY", note: "银行账单出账金额" },
        ],
      }],
    })} setData={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "记录结算" }));

    expect(screen.getByText("将按银行账单金额生成还款交易：")).toBeTruthy();
    expect(screen.getByText(/812\.34/)).toBeTruthy();
    expect(screen.getByText(/321\.00/)).toBeTruthy();
  });
});

function panelByHeading(name: string): HTMLElement {
  const panel = screen.getByRole("heading", { name }).closest(".panel");
  if (!panel) throw new Error(`Panel not found: ${name}`);
  return panel as HTMLElement;
}

function statementData(patch: Partial<AppData> = {}): AppData {
  const base = initialData();
  const account = { ...base.accounts[0], id: "card-a", name: "主卡", kind: "credit" as const, currency: "CNY" as const, currencyCodes: ["CNY", "USD"], statementDay: 10 };
  const secondAccount = { ...base.accounts[0], id: "card-b", name: "副卡", kind: "credit" as const, currency: "CNY" as const, currencyCodes: ["CNY", "JPY"], statementDay: 10 };
  return {
    ...base,
    accounts: [account, secondAccount],
    statements: [
      statement("jan-card-a", "card-a", "2026-01-31T23:59:59.000Z", true),
      statement("jan-card-b", "card-b", "2026-01-28T23:59:59.000Z", false),
      statement("feb-card-a", "card-a", "2026-02-28T23:59:59.000Z", false),
    ],
    transactions: [
      transaction("jan-cny", "card-a", 100, "CNY", "2026-01-10T00:00:00.000Z"),
      transaction("jan-usd", "card-a", 20, "USD", "2026-01-11T00:00:00.000Z"),
      transaction("jan-card-b", "card-b", 50, "CNY", "2026-01-12T00:00:00.000Z"),
      transaction("feb-card-a", "card-a", 80, "CNY", "2026-02-12T00:00:00.000Z"),
    ],
    ...patch,
  };
}

function statement(id: string, accountId: string, endAt: string, paid: boolean): CreditCardStatement {
  const month = endAt.slice(0, 7);
  return {
    id,
    createdAt: `${month}-01T00:00:00.000Z`,
    updatedAt: `${month}-01T00:00:00.000Z`,
    accountId,
    startAt: `${month}-01T00:00:00.000Z`,
    endAt,
    primaryCurrency: "CNY",
    paid,
  };
}

function combinedStatement(): CreditCardStatement {
  return {
    ...statement("combined", "card-a", "2026-01-31T23:59:59.000Z", false),
    accountIds: ["card-a", "card-b"],
  };
}

function transaction(id: string, accountId: string, amount: number, currency: string, occurredAt: string): Transaction {
  return {
    id,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    accountId,
    amount,
    currency,
    kind: "expense",
    occurredAt,
    tagIds: [],
    note: id,
  };
}