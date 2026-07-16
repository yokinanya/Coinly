import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAiSettings } from "./settings";
import { streamChatCompletion } from "./openAiTransport";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("streamChatCompletion", () => {
  it("parses fragmented SSE text and merges fragmented tool calls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fragmentedResponse([
      "data: {\"choices\":[{\"delta\":{\"content\":\"你",
      "好\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"type\":\"function\",\"function\":{\"name\":\"query_\",\"arguments\":\"{\\\"question\\\":\\\"餐\"}}]}}]}\n\n",
      "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"ledger\",\"arguments\":\"饮\\\"}\"}}]}}]}\n\ndata: [DONE]\n\n",
    ])));

    const stream = streamChatCompletion(settings(), { model: "model" }, []);
    const deltas: string[] = [];
    let result;
    while (true) {
      const next = await stream.next();
      if (next.done) {
        result = next.value;
        break;
      }
      deltas.push(next.value);
    }

    expect(deltas).toEqual(["你好"]);
    expect(result).toEqual({
      content: "你好",
      tool_calls: [{
        id: "call-1",
        type: "function",
        function: { name: "query_ledger", arguments: "{\"question\":\"餐饮\"}" },
      }],
    });
  });

  it("rejects providers that do not return an SSE content type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
    const stream = streamChatCompletion(settings(), { model: "model" }, []);

    await expect(stream.next()).rejects.toThrow("未返回兼容的流式 SSE");
  });

  it("surfaces malformed SSE JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("data: not-json\n\ndata: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    })));
    const stream = streamChatCompletion(settings(), { model: "model" }, []);

    await expect(stream.next()).rejects.toThrow("SSE 数据不是合法 JSON");
  });

  it("propagates an AbortError when generation is stopped", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return fragmentedResponse([]);
    }));
    const controller = new AbortController();
    controller.abort();
    const stream = streamChatCompletion(settings(), { model: "model" }, [], { signal: controller.signal });

    await expect(stream.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});

function settings() {
  return normalizeAiSettings({
    provider: "openai-compatible",
    endpoint: "https://api.example/v1",
    apiKey: "key",
    textModel: { model: "model" },
  });
}

function fragmentedResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
