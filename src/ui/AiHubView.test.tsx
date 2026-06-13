import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, Transaction, TransactionDraft } from "../domain/types";
import { AiHubView } from "./AiHubView";

const parseText = vi.fn<() => Promise<TransactionDraft>>();
const parseTextBatch = vi.fn<() => Promise<readonly TransactionDraft[]>>();
const parseImage = vi.fn<() => Promise<TransactionDraft>>();
const analyze = vi.fn<() => Promise<string>>();
const ask = vi.fn<() => Promise<string>>();
const suggestCategoryTag = vi.fn<() => Promise<{ readonly categoryId?: string; readonly tagIds: readonly string[]; readonly confidence: number }>>();

vi.mock("../ai/provider", () => ({
  createAiProvider: () => ({ parseText, parseTextBatch, parseImage, analyze, ask, suggestCategoryTag }),
}));

vi.mock("./toastApi", () => ({
  Message: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

describe("AiHubView", () => {
  beforeEach(() => {
    parseText.mockReset();
    parseTextBatch.mockReset();
    parseImage.mockReset();
    analyze.mockReset();
    ask.mockReset();
    suggestCategoryTag.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("saves selected text parse candidates", async () => {
    const data = initialData();
    const setData = vi.fn();
    parseTextBatch.mockResolvedValue([aiDraft(data, 38, "星巴克")]);

    renderHub(data, setData);
    fireEvent.change(screen.getByPlaceholderText("星巴克 38 元，餐饮，今天下午"), { target: { value: "星巴克 38" } });
    fireEvent.click(screen.getByText("解析文本"));

    expect(await screen.findByText("识别结果")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /保存选中 1/ }));

    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    const saved = setData.mock.calls[0][0] as AppData;
    expect(saved.transactions).toHaveLength(1);
    expect(saved.transactions[0]?.amount).toBe(38);
    expect(parseTextBatch).toHaveBeenCalledTimes(1);
    expect(parseText).not.toHaveBeenCalled();
  });

  it("runs AI analysis inside the hub", async () => {
    analyze.mockResolvedValue("## 本月概览\n支出稳定");

    renderHub(initialData(), vi.fn());
    fireEvent.click(screen.getByRole("tab", { name: "AI 分析" }));
    fireEvent.click(screen.getByText("分析账单"));

    expect(await screen.findByText("本月概览")).toBeTruthy();
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("answers natural language ledger questions", async () => {
    ask.mockResolvedValue("餐饮支出为 38 CNY。");

    renderHub(initialData(), vi.fn());
    fireEvent.click(screen.getByRole("tab", { name: "AI 问账" }));
    fireEvent.change(screen.getByPlaceholderText("这个月餐饮花了多少？"), { target: { value: "餐饮花了多少" } });
    fireEvent.click(screen.getByText("提问"));

    expect(await screen.findByText("餐饮支出为 38 CNY。" )).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("applies category suggestions after confirmation", async () => {
    const data = dataWithUncategorizedTransaction();
    const setData = vi.fn();
    suggestCategoryTag.mockResolvedValue({ categoryId: data.categories[0].id, tagIds: [], confidence: 0.8 });

    renderHub(data, setData);
    fireEvent.click(screen.getByRole("tab", { name: "智能补全" }));
    fireEvent.click(screen.getByText("生成建议"));

    expect(await screen.findByText("餐饮 · 不改标签")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /应用选中 1/ }));

    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    const saved = setData.mock.calls[0][0] as AppData;
    expect(saved.transactions[0]?.categoryId).toBe(data.categories[0].id);
  });
});

function renderHub(data: AppData, setData: (data: AppData) => void) {
  return render(<AiHubView data={withAiSettings(data)} setData={setData} />);
}

function withAiSettings(data: AppData): AppData {
  return {
    ...data,
    aiSettings: {
      provider: "openai-compatible",
      endpoint: "https://api.example/v1",
      apiKey: "key",
      textModel: { model: "text-model" },
      visionModel: { model: "vision-model", supportsVision: true },
    },
  };
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

function dataWithUncategorizedTransaction(): AppData {
  const data = initialData();
  const transaction = {
    id: "transaction-1",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
    kind: "expense",
    accountId: data.accounts[0]?.id ?? "",
    amount: 38,
    currency: "CNY",
    occurredAt: "2026-05-29",
    tagIds: [],
    note: "午餐",
  } satisfies Transaction;
  return { ...data, transactions: [transaction] };
}