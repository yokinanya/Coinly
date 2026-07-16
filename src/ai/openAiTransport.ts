import type { AiModelSettings } from "../domain/types";
import type { NormalizedAiSettings } from "./settings";

export interface ToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface ChatMessage {
  readonly content?: string;
  readonly tool_calls?: readonly ToolCall[];
}

interface ChatResponse {
  readonly choices: readonly { readonly message?: ChatMessage }[];
}

interface StreamDelta {
  readonly content?: string;
  readonly tool_calls?: readonly {
    readonly index: number;
    readonly id?: string;
    readonly type?: "function";
    readonly function?: { readonly name?: string; readonly arguments?: string };
  }[];
}

interface StreamChunk {
  readonly choices?: readonly { readonly delta?: StreamDelta }[];
}

interface MutableToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export async function requestChatCompletion(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  messages: readonly unknown[],
  options: { readonly tools?: readonly unknown[]; readonly signal?: AbortSignal } = {},
): Promise<ChatResponse> {
  const response = await fetchCompletion(settings, model, messages, { ...options, stream: false });
  return response.json() as Promise<ChatResponse>;
}

export async function* streamChatCompletion(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  messages: readonly unknown[],
  options: { readonly tools?: readonly unknown[]; readonly signal?: AbortSignal } = {},
): AsyncGenerator<string, ChatMessage> {
  const response = await fetchCompletion(settings, model, messages, { ...options, stream: true });
  assertEventStream(response);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("AI 流式响应没有可读取的内容");
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, MutableToolCall>();
  let content = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parsed = parseSseBuffer(buffer, done);
    buffer = parsed.remainder;
    for (const data of parsed.events) {
      if (data === "[DONE]") return { content, tool_calls: finalizedToolCalls(toolCalls) };
      const delta = parseStreamDelta(data);
      if (delta.content) {
        content += delta.content;
        yield delta.content;
      }
      mergeToolCalls(toolCalls, delta.tool_calls ?? []);
    }
    if (done) break;
  }
  if (buffer.trim()) throw new Error("AI 返回了不完整的 SSE 数据");
  return { content, tool_calls: finalizedToolCalls(toolCalls) };
}

async function fetchCompletion(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  messages: readonly unknown[],
  options: { readonly tools?: readonly unknown[]; readonly signal?: AbortSignal; readonly stream: boolean },
): Promise<Response> {
  if (!model.model.trim()) throw new Error("请先在设置中配置 AI 模型");
  const response = await fetch(chatCompletionsUrl(settings.endpoint), {
    method: "POST",
    headers: { authorization: `Bearer ${settings.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model.model,
      messages,
      stream: options.stream,
      ...(options.tools ? { tools: options.tools, tool_choice: "auto" } : {}),
    }),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`AI 调用失败：${response.status} ${response.statusText}`);
  return response;
}

function assertEventStream(response: Response): void {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/event-stream")) {
    throw new Error("当前 AI 提供商未返回兼容的流式 SSE 响应");
  }
}

function parseSseBuffer(value: string, flush: boolean): { readonly events: readonly string[]; readonly remainder: string } {
  const normalized = value.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const remainder = flush ? "" : blocks.pop() ?? "";
  const events = blocks.flatMap((block) => {
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    return data ? [data] : [];
  });
  if (flush && blocks.length === 0 && normalized.trim()) {
    throw new Error("AI 返回了非法 SSE 数据");
  }
  return { events, remainder };
}

function parseStreamDelta(data: string): StreamDelta {
  try {
    const chunk = JSON.parse(data) as StreamChunk;
    return chunk.choices?.[0]?.delta ?? {};
  } catch (error) {
    throw new Error("AI 返回的 SSE 数据不是合法 JSON", { cause: error });
  }
}

function mergeToolCalls(target: Map<number, MutableToolCall>, deltas: NonNullable<StreamDelta["tool_calls"]>): void {
  for (const delta of deltas) {
    const current = target.get(delta.index) ?? { id: "", type: "function", function: { name: "", arguments: "" } };
    target.set(delta.index, {
      id: current.id + (delta.id ?? ""),
      type: "function",
      function: {
        name: current.function.name + (delta.function?.name ?? ""),
        arguments: current.function.arguments + (delta.function?.arguments ?? ""),
      },
    });
  }
}

function finalizedToolCalls(calls: Map<number, MutableToolCall>): readonly ToolCall[] {
  return [...calls.entries()].sort(([left], [right]) => left - right).map(([, call]) => call);
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) throw new Error("AI Base URL 不能包含 /chat/completions");
  if (!trimmed) throw new Error("AI Base URL 不能为空");
  return `${trimmed}/chat/completions`;
}
