import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAssistantEvent, AiAssistantRequest, AiAssistantResult } from "../ai/provider";
import { initialData } from "../domain/factory";
import type { AppData, TransactionDraft } from "../domain/types";
import { AiHubView } from "./AiHubView";
import { emptyAiHubSession, type AiHubSession } from "./aiSession";

const streamAssistant = vi.fn<(request: AiAssistantRequest) => AsyncGenerator<AiAssistantEvent, AiAssistantResult>>();
const streamCommitConfirmation = vi.fn();

vi.mock("../ai/provider", async (importOriginal) => {
  const original = await importOriginal<typeof import("../ai/provider")>();
  return { ...original, createAiProvider: () => ({ streamAssistant, streamCommitConfirmation }) };
});

vi.mock("./toastApi", () => ({
  Message: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

describe("AiHubView", () => {
  beforeEach(() => {
    streamAssistant.mockReset();
    streamCommitConfirmation.mockReset();
    streamAssistant.mockImplementation(() => eventStream([{ type: "text-delta", text: "已完成。" }, { type: "finish", text: "已完成。" }]));
    streamCommitConfirmation.mockImplementation(() => textStream(["已写入 1 笔，共 38 CNY。"]));
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows actionable suggestions in an empty conversation", () => {
    renderHub(initialData(), vi.fn());

    expect(screen.getByRole("heading", { name: "你的财务 Copilot" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "分析本月收支" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "餐饮花了多少？" })).toBeTruthy();
  });

  it("renders streaming text and concise tool status", async () => {
    streamAssistant.mockImplementation(() => eventStream([
      { type: "tool-start", callId: "query", tool: "read_ledger", label: "正在读取账本…" },
      { type: "tool-complete", callId: "query", tool: "read_ledger", label: "已读取账本", summary: "{}" },
      { type: "text-delta", text: "餐饮支出为 " },
      { type: "text-delta", text: "**38 CNY**。" },
      { type: "finish", text: "餐饮支出为 **38 CNY**。" },
    ]));
    renderHub(initialData(), vi.fn());
    sendMessage("餐饮花了多少？");

    expect(await screen.findByText("已读取账本")).toBeTruthy();
    expect(await screen.findByText("38 CNY")).toBeTruthy();
    expect(streamAssistant).toHaveBeenCalledTimes(1);
  });

  it("includes prior turns in a follow-up request", async () => {
    streamAssistant
      .mockImplementationOnce(() => eventStream([{ type: "text-delta", text: "本月为 38 CNY。" }, { type: "finish", text: "本月为 38 CNY。" }]))
      .mockImplementationOnce(() => eventStream([{ type: "text-delta", text: "比上月少。" }, { type: "finish", text: "比上月少。" }]));
    renderHub(initialData(), vi.fn());
    sendMessage("本月餐饮多少？");
    expect(await screen.findByText("本月为 38 CNY。")).toBeTruthy();
    sendMessage("那上月呢？");
    expect(await screen.findByText("比上月少。")).toBeTruthy();

    expect(streamAssistant.mock.calls[1]?.[0].history).toEqual([
      expect.objectContaining({ role: "user", text: "本月餐饮多少？" }),
      expect.objectContaining({ role: "assistant", text: "本月为 38 CNY。" }),
    ]);
  });

  it("uses the provider default model and keeps model controls in the header flow", () => {
    const data = withProviderRegistry(initialData());
    renderHub(data, vi.fn());

    expect(screen.getByRole("button", { name: "切换模型" }).textContent).toContain("默认模型");
    fireEvent.click(screen.getByRole("button", { name: "切换模型" }));
    expect(screen.getByRole("menu", { name: "模型列表" })).toBeTruthy();
  });

  it("sends with Enter, preserves Shift+Enter, and clears with a new conversation", async () => {
    renderHub(initialData(), vi.fn());
    const input = screen.getByRole("textbox", { name: "输入消息" });
    fireEvent.change(input, { target: { value: "第一行" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect((input as HTMLTextAreaElement).value).toBe("第一行");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("已完成。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "新会话" }));
    expect(screen.queryByText("第一行")).toBeNull();
    expect(screen.getByRole("heading", { name: "你的财务 Copilot" })).toBeTruthy();
  });

  it("sends multiple images in stable order through a vision-capable session model", async () => {
    renderHub(initialData(), vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "切换模型" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "vision-model" }));
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [first, second] } });
    sendMessage("识别这些图片");
    expect(await screen.findByRole("img", { name: "first.png" })).toBeTruthy();
    expect(await screen.findByRole("img", { name: "second.png" })).toBeTruthy();
    expect(streamAssistant.mock.calls[0]?.[0].images).toEqual([first, second]);
  });

  it("requires explicit batch confirmation before saving candidates", async () => {
    const data = withAiSettings(initialData());
    const setData = vi.fn();
    const draft = sampleDraft(data);
    streamAssistant.mockImplementation(() => eventStream([
      { type: "candidate-batch", drafts: [draft] },
      { type: "text-delta", text: "已生成候选，尚未保存。" },
      { type: "finish", text: "已生成候选，尚未保存。" },
    ]));
    renderHub(data, setData);
    sendMessage("记一下午餐 38 元");

    expect(await screen.findByRole("region", { name: "待确认交易" })).toBeTruthy();
    expect(setData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存所选（1）" }));
    expect(setData).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("已写入 1 笔，共 38 CNY。")).toBeTruthy();
    expect(streamCommitConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ transactionIds: [expect.any(String)] }),
    }));
  });

  it("shows invalid candidate errors instead of silently dropping them", async () => {
    streamAssistant.mockImplementation(() => eventStream([
      { type: "candidate-batch", drafts: [{ amount: -1, currency: "XXX" }] },
      { type: "finish", text: "候选需要修正。" },
    ]));
    renderHub(initialData(), vi.fn());
    sendMessage("记录错误交易");

    expect(await screen.findByText("金额必须大于 0")).toBeTruthy();
    expect(screen.getByText("AI 返回的账户无法匹配当前账本")).toBeTruthy();
    expect((screen.getByRole("button", { name: "保存所选（0）" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("retries a failed confirmation without writing the transaction twice", async () => {
    const data = withAiSettings(initialData());
    const setData = vi.fn();
    streamAssistant.mockImplementation(() => eventStream([
      { type: "candidate-batch", drafts: [sampleDraft(data)] },
      { type: "finish", text: "请确认。" },
    ]));
    streamCommitConfirmation
      .mockImplementationOnce(() => failingTextStream())
      .mockImplementationOnce(() => textStream(["确认成功。"]));
    renderHub(data, setData);
    sendMessage("记录午餐");
    fireEvent.click(await screen.findByRole("button", { name: "保存所选（1）" }));

    expect(await screen.findByText("交易已写入，但 AI 确认回复失败。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试确认" }));
    expect(await screen.findByText("确认成功。")).toBeTruthy();
    expect(setData).toHaveBeenCalledTimes(1);
  });

  it("stops an active stream without turning cancellation into an error", async () => {
    streamAssistant.mockImplementation((request) => abortableStream(request));
    renderHub(initialData(), vi.fn());
    sendMessage("生成一份长报告");
    expect(await screen.findByText("正在生成")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));

    expect(await screen.findByRole("button", { name: "重新生成" })).toBeTruthy();
    expect(screen.queryByText("AI 调用失败")).toBeNull();
  });

  it("keeps the in-memory conversation when the assistant view is remounted", async () => {
    render(<PersistentHarness data={withAiSettings(initialData())} />);
    sendMessage("记住这段会话");
    expect(await screen.findByText("已完成。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "隐藏助手" }));
    fireEvent.click(screen.getByRole("button", { name: "显示助手" }));

    expect(screen.getByText("记住这段会话")).toBeTruthy();
    expect(screen.getByText("已完成。")).toBeTruthy();
  });
});

function TestHub(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [session, setSession] = useState<AiHubSession>(() => emptyAiHubSession());
  const data = props.data.aiSettings ? props.data : withAiSettings(props.data);
  return <AiHubView data={data} setData={props.setData} session={session} setSession={setSession} />;
}

function PersistentHarness(props: { readonly data: AppData }) {
  const [visible, setVisible] = useState(true);
  const [session, setSession] = useState<AiHubSession>(() => emptyAiHubSession());
  return (
    <>
      <button type="button" onClick={() => setVisible((current) => !current)}>{visible ? "隐藏助手" : "显示助手"}</button>
      {visible && <AiHubView data={props.data} setData={() => undefined} session={session} setSession={setSession} />}
    </>
  );
}

function renderHub(data: AppData, setData: (data: AppData) => void) {
  return render(<TestHub data={data} setData={setData} />);
}

function sendMessage(message: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "输入消息" }), { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
}

async function* eventStream(events: readonly AiAssistantEvent[]): AsyncGenerator<AiAssistantEvent, AiAssistantResult> {
  for (const event of events) yield event;
  const finish = [...events].reverse().find((event) => event.type === "finish");
  return { text: finish?.type === "finish" ? finish.text : "", transactionDrafts: [] };
}

async function* textStream(chunks: readonly string[]) {
  for (const chunk of chunks) yield chunk;
  return chunks.join("");
}

async function* failingTextStream() {
  await Promise.resolve();
  yield "";
  throw new Error("provider failed");
}

async function* abortableStream(request: AiAssistantRequest): AsyncGenerator<AiAssistantEvent, AiAssistantResult> {
  yield { type: "text-delta", text: "正在生成" };
  await new Promise<void>((_resolve, reject) => {
    request.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  return { text: "", transactionDrafts: [] };
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

function withProviderRegistry(data: AppData): AppData {
  return {
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
  };
}

function sampleDraft(data: AppData): TransactionDraft {
  return {
    kind: "expense",
    accountId: data.accounts[0]?.id ?? "",
    amount: 38,
    currency: data.currencies[0] ?? "CNY",
    occurredAt: "2026-07-11",
    tagIds: [],
    note: "午餐",
  };
}
