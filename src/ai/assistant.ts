import type { AiModelSettings } from "../domain/types";
import { buildDraftContext } from "./context";
import { readFileAsDataUrl } from "./media";
import { resolveAiModelCapabilities } from "./modelCapabilities";
import { streamChatCompletion, type ChatMessage, type ToolCall } from "./openAiTransport";
import type { NormalizedAiSettings } from "./settings";
import { executeAssistantTool, knownToolName, ledgerTools, toolStartLabel } from "./assistantTools";
import { buildAssistantPrompt } from "./promptPolicy";
import type {
  AiAssistantEvent,
  AiAssistantRequest,
  AiAssistantResult,
  AiConversationMessage,
  PreparedTransactionCandidate,
} from "./assistantTypes";

export async function* runAssistant(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  request: AiAssistantRequest,
): AsyncGenerator<AiAssistantEvent, AiAssistantResult> {
  const messages: unknown[] = [
    { role: "system", content: buildAssistantPrompt(settings.defaultPaymentAccountId, request.images?.length ?? 0, buildDraftContext(request.data, { settings: model })) },
    ...historyMessages(request.history),
    { role: "user", content: await userContent(request.input, request.images, model) },
  ];
  const transactionDrafts: PreparedTransactionCandidate[] = [];
  const completedCalls = new Set<string>();
  let fullText = "";
  yield { type: "phase", phase: "thinking" };
  while (true) {
    const message = yield* consumeRound(settings, model, request, messages, (text) => {
      fullText += text;
    });
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      yield { type: "phase", phase: looksLikeClarification(fullText) ? "clarifying" : "completed" };
      yield { type: "finish", text: fullText };
      return { text: fullText, transactionDrafts };
    }
    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
    for (const call of calls) {
      assertNotRepeated(call, completedCalls);
      const tool = knownToolName(call.function.name);
      yield { type: "phase", phase: tool === "read_ledger" ? "reading" : "reviewing" };
      yield { type: "tool-start", callId: call.id, tool, label: toolStartLabel(tool) };
      try {
        const result = executeAssistantTool({
          call,
          data: request.data,
          model,
          settings,
          imageCount: request.images?.length,
        });
        transactionDrafts.push(...result.candidates);
        if (result.candidates.length > 0) {
          yield { type: "phase", phase: "reviewing" };
          yield { type: "candidate-batch", drafts: result.candidates };
        }
        yield { type: "tool-complete", callId: call.id, tool, label: result.completeLabel, summary: result.traceSummary };
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.content) });
      } catch (error) {
        yield { type: "tool-failed", callId: call.id, tool, label: errorMessage(error) };
        throw error;
      }
    }
  }
}

async function* consumeRound(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  request: AiAssistantRequest,
  messages: readonly unknown[],
  append: (text: string) => void,
): AsyncGenerator<AiAssistantEvent, ChatMessage> {
  const stream = streamChatCompletion(settings, model, messages, { tools: ledgerTools(request.images?.length ?? 0), signal: request.signal });
  while (true) {
    const next = await stream.next();
    if (next.done) return next.value;
    append(next.value);
    yield { type: "text-delta", text: next.value };
  }
}

function historyMessages(history: readonly AiConversationMessage[]): readonly unknown[] {
  return history.map((message) => ({
    role: message.role,
    content: message.role === "user"
      ? message.attachmentSummary ? `${message.text}\n[历史附件：${message.attachmentSummary}]` : message.text
      : assistantHistoryContent(message),
  }));
}

async function userContent(
  text: string,
  images: readonly File[] | undefined,
  model: AiModelSettings,
): Promise<string | readonly unknown[]> {
  if (!images?.length) return text;
  if (!resolveAiModelCapabilities(model).supportsVision) {
    throw new Error("当前会话历史包含图片，请切换到支持图片的模型或开始新会话");
  }
  const imageParts = await Promise.all(images.map(async (image) => ({
    type: "image_url",
    image_url: { url: await readFileAsDataUrl(image) },
  })));
  return [{ type: "text", text: text || "请根据这些图片回答。" }, ...imageParts];
}

function assistantHistoryContent(message: AiConversationMessage): string {
  const metadata = {
    toolTraces: message.toolTraces,
    commitResult: message.commitResult,
  };
  return message.toolTraces?.length || message.commitResult
    ? `${message.text}\n\nCoinly 结构化记录：${JSON.stringify(metadata)}`
    : message.text;
}

function assertNotRepeated(call: ToolCall, completedCalls: Set<string>): void {
  const signature = `${call.function.name}:${call.function.arguments}`;
  if (completedCalls.has(signature)) {
    throw new Error(`检测到重复工具调用循环：${call.function.name}`);
  }
  completedCalls.add(signature);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "工具执行失败";
}

function looksLikeClarification(text: string): boolean {
  return /请(?:提供|补充|告诉我)|还需要(?:确认|提供)|缺少/.test(text);
}
