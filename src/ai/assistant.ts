import type { AiModelSettings, AppData } from "../domain/types";
import { buildDraftContext } from "./context";
import { readFileAsDataUrl } from "./media";
import { resolveAiModelCapabilities } from "./modelCapabilities";
import { streamChatCompletion, type ChatMessage, type ToolCall } from "./openAiTransport";
import type { NormalizedAiSettings } from "./settings";
import { executeAssistantTool, knownToolName, ledgerTools, toolStartLabel } from "./assistantTools";
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
    { role: "system", content: assistantPrompt(request.data, model, settings.defaultPaymentAccountId, request.images?.length ?? 0) },
    ...historyMessages(request.history),
    { role: "user", content: await userContent(request.input, request.images, model) },
  ];
  const transactionDrafts: PreparedTransactionCandidate[] = [];
  const completedCalls = new Set<string>();
  let fullText = "";
  while (true) {
    const message = yield* consumeRound(settings, model, request, messages, (text) => {
      fullText += text;
    });
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      yield { type: "finish", text: fullText };
      return { text: fullText, transactionDrafts };
    }
    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
    for (const call of calls) {
      assertNotRepeated(call, completedCalls);
      const tool = knownToolName(call.function.name);
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

function assistantPrompt(data: AppData, model: AiModelSettings, defaultAccountId: string | undefined, imageCount: number): string {
  const draftContext = buildDraftContext(data, { settings: model });
  return [
    "你是 Coinly 的个人财务 Copilot。需要账本事实时必须调用工具，不要编造或自行计算账本数据。",
    "自行判断是否调用查账、分析或交易候选工具，不要向用户展示内部路由。",
    "prepare_transactions 只生成待确认候选，必须明确说明尚未保存，等待用户确认。",
    "绝不能声称已经创建、修改或删除交易、分类、标签、预算或订阅。",
    "涉及金额时必须带币种代码或币种名称；没有足够数据时直接说明无法确定。",
    "输出简洁中文 Markdown，并理解之前的会话内容以回答连续追问。",
    `AI 默认支付账户 ID：${defaultAccountId ?? "未配置"}；未明确账户的收入、支出、退款和转账候选都使用该默认账户。`,
    `当前消息图片数量：${imageCount}；sourceImageIndexes 只能引用当前消息中的图片，编号从 0 开始；没有图片时省略该字段。`,
    `记账字段上下文：${JSON.stringify(draftContext)}`,
  ].join("\n");
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
