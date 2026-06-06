import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, TransactionDraft } from "../domain/types";
import { EntryView } from "./EntryView";

const parseText = vi.fn<() => Promise<TransactionDraft>>();

vi.mock("../ai/provider", () => ({
  createAiProvider: () => ({ parseText, parseImage: vi.fn() }),
}));

vi.mock("./toastApi", () => ({
  Message: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

describe("EntryView", () => {
  beforeEach(() => {
    parseText.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("saves a valid AI candidate directly", async () => {
    const data = initialData();
    const setData = vi.fn();
    parseText.mockResolvedValue(aiDraft(data, 38, "星巴克"));

    renderEntry(data, setData);
    fireEvent.change(screen.getByPlaceholderText("例如：星巴克 38 元，餐饮，今天下午"), { target: { value: "星巴克 38" } });
    fireEvent.click(screen.getByText("解析文本"));

    expect(await screen.findByText("星巴克")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    const saved = setData.mock.calls[0][0] as AppData;
    expect(saved.transactions).toHaveLength(1);
    expect(saved.transactions[0]?.amount).toBe(38);
    expect(saved.transactions[0]?.note).toBe("星巴克");
    expect(screen.queryByText("识别结果")).toBeNull();
  });

  it("shows candidate validation errors without saving", async () => {
    const data = initialData();
    const setData = vi.fn();
    parseText.mockResolvedValue(aiDraft(data, 38, "星巴克"));

    renderEntry(data, setData);
    fireEvent.change(screen.getByPlaceholderText("例如：星巴克 38 元，餐饮，今天下午"), { target: { value: "星巴克 38" } });
    fireEvent.click(screen.getByText("解析文本"));
    await screen.findByText("星巴克");
    fireEvent.click(screen.getByText("编辑详情"));
    fireEvent.change(screen.getByDisplayValue("38"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("金额必须大于 0")).toBeTruthy();
    expect(setData).not.toHaveBeenCalled();
  });

  it("saves edited AI candidate details", async () => {
    const data = initialData();
    const setData = vi.fn();
    parseText.mockResolvedValue(aiDraft(data, 38, "星巴克"));

    renderEntry(data, setData);
    fireEvent.change(screen.getByPlaceholderText("例如：星巴克 38 元，餐饮，今天下午"), { target: { value: "星巴克 38" } });
    fireEvent.click(screen.getByText("解析文本"));
    await screen.findByText("星巴克");
    fireEvent.click(screen.getByText("编辑详情"));
    fireEvent.change(screen.getByDisplayValue("38"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    const saved = setData.mock.calls[0][0] as AppData;
    expect(saved.transactions[0]?.amount).toBe(45);
  });

  it("keeps manual entry collapsed by default and saves after expansion", async () => {
    const data = initialData();
    const setData = vi.fn();

    renderEntry(data, setData);
    expect(screen.queryByText("金额")).toBeNull();
    fireEvent.click(screen.getByText("手工记账"));
    expect(screen.getByText("金额")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("0"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("保存交易"));

    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    const saved = setData.mock.calls[0][0] as AppData;
    expect(saved.transactions[0]?.amount).toBe(12);
  });

  it("keeps AI entry primary and shows manual field errors after expansion", async () => {
    const data = initialData();
    const setData = vi.fn();

    renderEntry(data, setData);
    expect(screen.getByText("解析文本").closest("button")?.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("金额")).toBeNull();

    fireEvent.click(screen.getByText("手工记账"));
    fireEvent.click(screen.getByText("保存交易"));

    const error = await screen.findByText("金额必须大于 0");
    expect(error).toBeTruthy();
    expect(setData).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByDisplayValue("0")));
  });
});

function renderEntry(data: AppData, setData: (data: AppData) => void) {
  return render(<EntryView data={data} setData={setData} setStatus={vi.fn()} />);
}

function aiDraft(data: AppData, amount: number, note: string): TransactionDraft {
  return {
    kind: "expense",
    accountId: data.accounts[0]?.id ?? "",
    amount,
    currency: "CNY",
    occurredAt: "2026-05-29",
    categoryId: data.categories[0]?.id,
    tagIds: [],
    note,
  };
}
