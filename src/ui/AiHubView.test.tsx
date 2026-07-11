import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, TransactionDraft } from "../domain/types";
import { AiHubView } from "./AiHubView";

const parseText = vi.fn<() => Promise<TransactionDraft>>();
const parseTextBatch = vi.fn<() => Promise<readonly TransactionDraft[]>>();
const parseImage = vi.fn<() => Promise<TransactionDraft>>();
const analyze = vi.fn<() => Promise<string>>();
const ask = vi.fn<(question: string, data: AppData, image?: File) => Promise<{ readonly answer: string; readonly transactionDrafts: readonly TransactionDraft[] }>>();
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

  it("treats unmentioned analysis keywords as a normal AI request", async () => {
    ask.mockResolvedValue(response("## 本月概览\n支出稳定"));

    renderHub(initialData(), vi.fn());
    sendChatMessage("分析本月账单");

    expect(await screen.findByText("本月概览")).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("answers natural language ledger questions", async () => {
    ask.mockResolvedValue(response("餐饮支出为 38 CNY。"));

    renderHub(initialData(), vi.fn());
    sendChatMessage("餐饮花了多少？");

    expect(await screen.findByText("餐饮支出为 38 CNY。" )).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("uses the active provider default model for a new chat", () => {
    const data = initialData();
    renderHub({
      ...data,
      aiSettings: {
        provider: "openai-compatible",
        endpoint: "https://api.example/v1",
        apiKey: "key",
        activeProviderId: "primary",
        activeModelId: "legacy-model",
        providers: [{
          id: "primary",
          name: "Primary",
          protocol: "openai-compatible",
          endpoint: "https://api.example/v1",
          apiKey: "key",
          defaultModelId: "preferred-model",
          models: [
            { id: "legacy-model", name: "旧模型", model: "legacy" },
            { id: "preferred-model", name: "默认模型", model: "preferred" },
          ],
        }],
      },
    }, vi.fn());

    expect(screen.getByRole("button", { name: "切换模型" }).textContent).toContain("默认模型");
  });

  it("sends with Enter and inserts a line break with Shift+Enter", async () => {
    ask.mockResolvedValue(response("已发送。"));
    renderHub(initialData(), vi.fn());
    const input = screen.getByRole("textbox", { name: "输入消息" });

    fireEvent.change(input, { target: { value: "第一行" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect((input as HTMLTextAreaElement).value).toBe("第一行");

    fireEvent.change(input, { target: { value: "发送这条消息" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("已发送。")).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("clears the current context without retaining chat history", async () => {
    ask.mockResolvedValue(response("旧会话回答。"));
    renderHub(initialData(), vi.fn());
    sendChatMessage("餐饮花了多少？");
    expect(await screen.findByText("旧会话回答。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "新会话" }));

    expect(screen.queryByText("旧会话回答。")).toBeNull();
    expect(screen.queryByText("餐饮花了多少？")).toBeNull();
    expect(screen.getByText("你可以直接问账、粘贴消费记录，或让我分析账本。")).toBeTruthy();
  });

  it("does not expose local tool routing controls", () => {
    renderHub(initialData(), vi.fn());

    expect(screen.queryByRole("button", { name: "AI 功能模式" })).toBeNull();
    expect(screen.queryByRole("listbox", { name: "AI 工具" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "切换模型" }));
    expect(screen.getByRole("menu", { name: "模型列表" })).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "管理模型" }));
    expect(screen.getByRole("dialog", { name: "提供商管理" })).toBeTruthy();
  });

  it("sends @ text to the model without a local route override", async () => {
    ask.mockResolvedValue(response("由模型决定是否调用工具。"));
    renderHub(initialData(), vi.fn());
    const input = screen.getByRole("textbox", { name: "输入消息" });

    fireEvent.change(input, { target: { value: "@分析 餐饮花了多少？" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("由模型决定是否调用工具。")).toBeTruthy();
    expect(ask).toHaveBeenCalledWith("@分析 餐饮花了多少？", expect.anything(), undefined);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("sends inserted images through a vision-capable session model", async () => {
    ask.mockResolvedValue(response("图片已识别。"));
    renderHub(initialData(), vi.fn());

    fireEvent.click(screen.getByRole("button", { name: "切换模型" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "vision-model" }));
    const file = new File(["receipt"], "receipt.png", { type: "image/png" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    sendChatMessage("识别这张图片");

    expect(await screen.findByText("图片已识别。")).toBeTruthy();
    expect(screen.getByRole("img", { name: "receipt.png" })).toBeTruthy();
    expect(ask).toHaveBeenLastCalledWith("识别这张图片", expect.anything(), file);
  });

  it("requires confirmation before saving a model-prepared transaction", async () => {
    const data = initialData();
    const setData = vi.fn();
    ask.mockResolvedValue(response("已生成待确认交易。", [{ kind: "expense", accountId: data.accounts[0]?.id ?? "", amount: 38, currency: "CNY", occurredAt: "2026-07-11", tagIds: [], note: "午餐" }]));

    renderHub(data, setData);
    sendChatMessage("记一下午餐 38 元");

    expect(await screen.findByText("待确认交易")).toBeTruthy();
    expect(setData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存交易" }));
    expect(setData).toHaveBeenCalledTimes(1);
  });

});

function renderHub(data: AppData, setData: (data: AppData) => void) {
  return render(<AiHubView data={data.aiSettings ? data : withAiSettings(data)} setData={setData} />);
}

function sendChatMessage(message: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "输入消息" }), { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
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

function response(answer: string, transactionDrafts: readonly TransactionDraft[] = []) {
  return { answer, transactionDrafts };
}