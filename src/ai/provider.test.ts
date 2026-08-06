import { afterEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import { buildAnalysisInput, chatCompletionsUrl, createAiProvider, parseDraftArrayContent, parseDraftContent, systemPrompt } from "./provider";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildAnalysisInput", () => {
  it("includes aggregated ledger context without full transactions", () => {
    const input = JSON.parse(buildAnalysisInput(initialData())) as Record<string, unknown>;

    expect(input).toHaveProperty("selectedRange");
    expect(input).toHaveProperty("budgets");
    expect(input).not.toHaveProperty("transactions");
    expect(input).toHaveProperty("contextMeta");
  });
});

describe("systemPrompt", () => {
  it("constrains draft fields and transaction kind values", () => {
    const content = systemPrompt(initialData()).content;

    expect(content).toContain("kind 只能从这些枚举中选择");
    expect(content).toContain("expense");
    expect(content).toContain("不要输出中文类型");
    expect(content).toContain("tagIds 必须是标签 id 数组");
    expect(content).toContain("不要输出具体时间");
  });
});

describe("parseImage", () => {
  it("rejects image parsing when the configured vision model does not support vision", async () => {
    const provider = createAiProvider({
      provider: "openai-compatible",
      endpoint: "https://api.openai.com/v1",
      apiKey: "key",
      textModel: { model: "gpt-4o-mini" },
      visionModel: { model: "deepseek-chat" },
    });

    await expect(provider.parseImage(new File([""], "receipt.png"), initialData())).rejects.toThrow("不支持图片解析");
  });

  it("routes text and image parsing to different configured models", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sampleDraft()) } }] }), { status: 200 });
    }));
    vi.stubGlobal("FileReader", class {
      result = "data:image/png;base64,AA==";
      error: DOMException | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() {
        this.onload?.();
      }
    });
    const provider = createAiProvider({
      provider: "openai-compatible",
      endpoint: "https://api.example/v1",
      apiKey: "key",
      textModel: { model: "text-model" },
      visionModel: { model: "vision-model", supportsVision: true },
    });

    await provider.parseText("午餐 12.5", initialData());
    await provider.parseImage(new File(["image"], "receipt.png"), initialData());

    expect(requests.map((body) => JSON.parse(body) as { model: string })).toEqual([
      expect.objectContaining({ model: "text-model" }),
      expect.objectContaining({ model: "vision-model" }),
    ]);
  });
});

describe("parseText", () => {
  it("uses the active provider endpoint, API key, and model", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(sampleDraft()) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const provider = createAiProvider({
      provider: "openai-compatible",
      endpoint: "",
      apiKey: "",
      providers: [
        { id: "first", name: "First", protocol: "openai-compatible", endpoint: "https://first.example/v1", apiKey: "first-key", defaultModelId: "chat", models: [{ id: "chat", model: "first-model" }] },
        { id: "second", name: "Second", protocol: "openai-compatible", endpoint: "https://second.example/v1", apiKey: "second-key", defaultModelId: "reasoning", models: [{ id: "reasoning", model: "second-model" }] },
      ],
      activeProviderId: "second",
      activeModelId: "reasoning",
    });

    await provider.parseText("午餐 12.5", initialData());

    expect(fetch).toHaveBeenCalledWith("https://second.example/v1/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer second-key" }),
      body: expect.stringContaining('"model":"second-model"'),
    }));
  });

  it("rejects empty configured model names before sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const provider = createAiProvider({
      provider: "openai-compatible",
      endpoint: "https://api.openai.com/v1",
      apiKey: "key",
      textModel: { model: "" },
      visionModel: { model: "gpt-4o-mini" },
    });

    await expect(provider.parseText("午餐 12.5", initialData())).rejects.toThrow("配置 AI 模型");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("streamAssistant", () => {
  it("lets the model choose a read-only ledger tool before streaming an answer", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (requests.length === 1) {
        return sseResponse([
          { choices: [{ delta: { tool_calls: [{ index: 0, id: "call-query", type: "function", function: { name: "read_ledger", arguments: "{\"operation\":\"query\",\"metric\":\"sum\"," } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"groupBy\":\"category\"}" } }] } }] },
        ]);
      }
      return sseResponse([
        { choices: [{ delta: { content: "本月餐饮支出" } }] },
        { choices: [{ delta: { content: "为 38 CNY。" } }] },
      ]);
    }));
    const provider = createAiProvider({
      provider: "openai-compatible",
      endpoint: "https://api.example/v1",
      apiKey: "key",
      textModel: { model: "tool-model" },
      visionModel: { model: "vision-model", supportsVision: true },
    });

    const events = [];
    for await (const event of provider.streamAssistant({ data: initialData(), history: [], input: "本月餐饮花了多少？" })) {
      events.push(event);
    }

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ model: "tool-model", stream: true, tool_choice: "auto" });
    expect(requests[0]?.tools).toEqual(expect.arrayContaining([expect.objectContaining({ function: expect.objectContaining({ name: "read_ledger" }) })]));
    expect(requests[1]?.messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: "tool", tool_call_id: "call-query" })]));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "tool-start", tool: "read_ledger" }),
      expect.objectContaining({ type: "tool-complete", label: "已读取 0 笔交易" }),
      { type: "text-delta", text: "本月餐饮支出" },
      { type: "text-delta", text: "为 38 CNY。" },
      { type: "finish", text: "本月餐饮支出为 38 CNY。" },
    ]));
  });

  it("sends completed conversation history with a follow-up turn", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return sseResponse([{ choices: [{ delta: { content: "回答" } }] }]);
    }));
    const provider = createAiProvider({
      provider: "openai-compatible",
      endpoint: "https://api.example/v1",
      apiKey: "key",
      textModel: { model: "tool-model" },
    });

    await consume(provider.streamAssistant({
      data: initialData(),
      history: [
        { role: "user", text: "本月餐饮多少？" },
        { role: "assistant", text: "本月为 38 CNY。" },
      ],
      input: "那上月呢？",
    }));

    expect(requests[0]?.messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "本月餐饮多少？" },
      { role: "assistant", content: "本月为 38 CNY。" },
      { role: "user", content: "那上月呢？" },
    ]);
  });

  it("fails explicitly when the model repeats an identical tool call", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([{
      choices: [{ delta: { tool_calls: [{
        index: 0,
        id: "call-query",
        type: "function",
        function: { name: "read_ledger", arguments: "{\"operation\":\"query\",\"metric\":\"count\",\"groupBy\":\"none\"}" },
      }] } }],
    }])));
    const provider = createAiProvider({
      provider: "openai-compatible",
      endpoint: "https://api.example/v1",
      apiKey: "key",
      textModel: { model: "tool-model" },
    });

    await expect(consume(provider.streamAssistant({ data: initialData(), history: [], input: "复杂问题" })))
      .rejects.toThrow("重复工具调用循环");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("parseDraftContent", () => {
  it("parses draft JSON from fenced model output", () => {
    const draft = parseDraftContent(`结果如下：\n\`\`\`json\n${JSON.stringify(sampleDraft())}\n\`\`\``);

    expect(draft).toMatchObject({ kind: "expense", amount: 12.5, currency: "CNY" });
  });

  it("parses the first balanced JSON object with braces inside strings", () => {
    const draft = parseDraftContent(`已解析 ${JSON.stringify({ ...sampleDraft(), note: "午餐 {优惠}" })} 请确认`);

    expect(draft.note).toBe("午餐 {优惠}");
  });

  it("rejects output without a JSON object", () => {
    expect(() => parseDraftContent("无法解析")).toThrow("AI 未返回 TransactionDraft JSON 对象");
  });
});

describe("parseDraftArrayContent", () => {
  it("parses draft arrays from fenced model output", () => {
    const drafts = parseDraftArrayContent(`结果如下：\n\`\`\`json\n${JSON.stringify([sampleDraft(), { ...sampleDraft(), amount: 38 }])}\n\`\`\``);

    expect(drafts).toHaveLength(2);
    expect(drafts[1]?.amount).toBe(38);
  });

  it("rejects output without a JSON array", () => {
    expect(() => parseDraftArrayContent(JSON.stringify(sampleDraft()))).toThrow("JSON 数组");
  });
});

describe("chatCompletionsUrl", () => {
  it("builds chat completions URL from a base URL", () => {
    expect(chatCompletionsUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("rejects a full chat completions request path", () => {
    expect(() => chatCompletionsUrl("https://api.openai.com/v1/chat/completions")).toThrow("Base URL");
  });
});

function sampleDraft() {
  return {
    kind: "expense",
    accountId: "cash",
    amount: 12.5,
    currency: "CNY",
    occurredAt: "2026-05-14T00:00:00.000Z",
    tagIds: [],
    note: "午餐",
  };
}

function sseResponse(chunks: readonly unknown[]): Response {
  const body = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function consume(stream: AsyncGenerator<unknown, unknown>): Promise<void> {
  let next = await stream.next();
  while (!next.done) next = await stream.next();
}
