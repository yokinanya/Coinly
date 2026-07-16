import type { AiModelSettings, TransactionDraft } from "../domain/types";
import { readFileAsDataUrl } from "./media";
import { resolveAiModelCapabilities } from "./modelCapabilities";
import { streamChatCompletion, type ChatMessage } from "./openAiTransport";
import type { NormalizedAiSettings } from "./settings";
import { executeAssistantTool, LEDGER_TOOLS, toolStartLabel } from "./assistantTools";
import type { AiAssistantEvent, AiAssistantRequest, AiAssistantResult, AiConversationMessage } from "./assistantTypes";

const MAX_TOOL_ROUNDS = 4;

export async function* runAssistant(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  request: AiAssistantRequest,
): AsyncGenerator<AiAssistantEvent, AiAssistantResult> {
  const messages: unknown[] = [{ role: "system", content: assistantPrompt() }, ...await historyMessages(request.history, model)];
  messages.push({ role: "user", content: await userContent(request.input, request.image, model) });
  const transactionDrafts: TransactionDraft[] = [];
  let fullText = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const stream = streamChatCompletion(settings, model, messages, { tools: LEDGER_TOOLS, signal: request.signal });
    let message: ChatMessage;
    while (true) {
      const next = await stream.next();
      if (next.done) {
        message = next.value;
        break;
      }
      fullText += next.value;
      yield { type: "text-delta", text: next.value };
    }
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      yield { type: "finish", text: fullText };
      return { text: fullText, transactionDrafts };
    }
    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const tool = toolName(call.function.name);
      yield { type: "tool-start", callId: call.id, tool, label: toolStartLabel(tool) };
      const result = await executeAssistantTool({
        call,
        data: request.data,
        model,
        settings,
        image: request.image,
        userInput: request.input,
        signal: request.signal,
      });
      transactionDrafts.push(...result.transactionDrafts);
      if (result.transactionDrafts.length > 0) yield { type: "candidate-batch", drafts: result.transactionDrafts };
      yield { type: "tool-complete", callId: call.id, tool, label: result.completeLabel };
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.content) });
    }
  }
  throw new Error("AI 工具调用次数过多，请缩小问题范围后重试");
}

async function historyMessages(history: readonly AiConversationMessage[], model: AiModelSettings): Promise<readonly unknown[]> {
  return Promise.all(history.map(async (message) => ({
    role: message.role,
    content: message.role === "user" ? await userContent(message.text, message.image, model) : message.text,
  })));
}

async function userContent(text: string, image: File | undefined, model: AiModelSettings): Promise<string | readonly unknown[]> {
  if (!image) return text;
  if (!resolveAiModelCapabilities(model).supportsVision) {
    throw new Error("当前会话历史包含图片，请切换到支持图片的模型或开始新会话");
  }
  return [
    { type: "text", text: text || "请根据这张图片回答。" },
    { type: "image_url", image_url: { url: await readFileAsDataUrl(image) } },
  ];
}

function toolName(value: string) {
  if (value === "query_ledger" || value === "analyze_ledger" || value === "prepare_transaction") return value;
  throw new Error(`AI 请求了不允许的工具：${value}`);
}

function assistantPrompt(): string {
  return [
    "你是 Coinly 的个人财务 Copilot。需要账本事实时必须调用工具，不要编造数据。",
    "自行判断是否调用查账、分析或交易候选工具，不要向用户展示内部路由。",
    "prepare_transaction 只生成待确认候选，必须明确说明尚未保存，等待用户确认。",
    "绝不能声称已经创建、修改或删除交易、分类、标签、预算或订阅。",
    "涉及金额时必须带币种代码或币种名称；没有足够数据时直接说明无法确定。",
    "输出简洁中文 Markdown，并理解之前的会话内容以回答连续追问。",
  ].join("\n");
}
