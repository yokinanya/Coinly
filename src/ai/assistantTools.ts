import type { AiModelSettings, AppData, TransactionDraft } from "../domain/types";
import { analysisScopeLabel, buildAnalysisContext, buildDraftSystemPrompt, buildQueryContext, type AnalysisScope } from "./context";
import { readFileAsDataUrl } from "./media";
import { resolveAiModelCapabilities } from "./modelCapabilities";
import { requestChatCompletion, type ToolCall } from "./openAiTransport";
import { parseDraftArrayContent, parseDraftContent } from "./responseParsing";
import { selectTextModel, withAiSelection, type NormalizedAiSettings } from "./settings";
import type { AiToolName } from "./assistantTypes";

export const LEDGER_TOOLS = [
  tool("query_ledger", "查询账本的交易、分类、标签、预算和汇总数据。回答任何金额、消费、收入、类别或交易问题前都应调用。", {
    type: "object",
    properties: { question: { type: "string", description: "需要在账本中核对的具体问题" } },
    required: ["question"],
    additionalProperties: false,
  }),
  tool("analyze_ledger", "按时间范围生成账本的聚合分析数据。仅在用户明确要求分析、趋势、报告、总结或风险时调用。", {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["current-month", "last-3-months", "last-6-months", "year-to-date"],
        description: "分析时间范围",
      },
    },
    required: ["scope"],
    additionalProperties: false,
  }),
  tool("prepare_transaction", "当用户要求记录、记账、添加或创建交易时调用。工具只生成待确认交易，绝不会直接保存。", {
    type: "object",
    properties: { input: { type: "string", description: "需要解析的交易描述；图片场景可复述用户意图" } },
    required: ["input"],
    additionalProperties: false,
  }),
] as const;

export interface ToolExecution {
  readonly tool: AiToolName;
  readonly content: unknown;
  readonly transactionDrafts: readonly TransactionDraft[];
  readonly startLabel: string;
  readonly completeLabel: string;
}

export async function executeAssistantTool(options: {
  readonly call: ToolCall;
  readonly data: AppData;
  readonly model: AiModelSettings;
  readonly settings: NormalizedAiSettings;
  readonly image?: File;
  readonly userInput: string;
  readonly signal?: AbortSignal;
}): Promise<ToolExecution> {
  const toolName = knownToolName(options.call.function.name);
  const args = parseArguments(options.call);
  if (toolName === "query_ledger") return queryLedger(options.data, options.model, args);
  if (toolName === "analyze_ledger") return analyzeLedger(options.data, options.model, args);
  return prepareTransaction(options, args);
}

export function toolStartLabel(name: AiToolName): string {
  if (name === "query_ledger") return "正在查询账本…";
  if (name === "analyze_ledger") return "正在分析账本…";
  return "正在生成交易候选…";
}

function queryLedger(data: AppData, model: AiModelSettings, args: Record<string, unknown>): ToolExecution {
  const question = typeof args.question === "string" ? args.question.trim() : "";
  const content = question ? buildQueryContext(data, question, { settings: model }) : { error: "缺少 question 参数" };
  return execution("query_ledger", content, [], question ? "已查询账本" : "账本查询参数无效");
}

function analyzeLedger(data: AppData, model: AiModelSettings, args: Record<string, unknown>): ToolExecution {
  const scope = args.scope;
  const validScope = isAnalysisScope(scope);
  const content = validScope ? buildAnalysisContext(data, { settings: model, analysisScope: scope }) : { error: "scope 参数无效" };
  return execution("analyze_ledger", content, [], validScope ? `已分析${analysisScopeLabel(scope)}` : "分析范围无效");
}

async function prepareTransaction(
  options: Parameters<typeof executeAssistantTool>[0],
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  const input = typeof args.input === "string" && args.input.trim() ? args.input.trim() : options.userInput;
  const drafts = options.image
    ? [await prepareImageDraft(options.settings, options.data, input, options.image, options.signal)]
    : await prepareTextDrafts(options.settings, options.model, options.data, input, options.signal);
  return execution("prepare_transaction", { candidates: drafts, requiresConfirmation: true }, drafts, `已生成 ${drafts.length} 笔候选`);
}

async function prepareTextDrafts(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  data: AppData,
  input: string,
  signal?: AbortSignal,
): Promise<readonly TransactionDraft[]> {
  const response = await requestChatCompletion(settings, model, [
    buildDraftSystemPrompt(data, { settings: model, input, mode: "batch" }),
    { role: "user", content: `解析交易描述，只返回 TransactionDraft JSON 数组：${input}` },
  ], { signal });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI 未返回可解析内容");
  return parseDraftArrayContent(content);
}

async function prepareImageDraft(
  settings: NormalizedAiSettings,
  data: AppData,
  input: string,
  image: File,
  signal?: AbortSignal,
): Promise<TransactionDraft> {
  const visionSettings = selectVisionSettings(settings);
  const model = selectTextModel(visionSettings);
  assertVisionSupported(model);
  const response = await requestChatCompletion(visionSettings, model, [
    buildDraftSystemPrompt(data, { settings: model }),
    { role: "user", content: [
      { type: "text", text: `根据图片和用户意图解析交易，只返回 TransactionDraft JSON：${input}` },
      { type: "image_url", image_url: { url: await readFileAsDataUrl(image) } },
    ] },
  ], { signal });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI 未返回可解析内容");
  return parseDraftContent(content);
}

function selectVisionSettings(settings: NormalizedAiSettings): NormalizedAiSettings {
  for (const provider of settings.providers) {
    if (!provider.apiKey) continue;
    const model = provider.models.find((item) => item.id === settings.visionModel.id && item.model === settings.visionModel.model);
    if (model) return withAiSelection(settings, provider.id, model.id);
  }
  return settings;
}

function assertVisionSupported(model: AiModelSettings): void {
  if (!resolveAiModelCapabilities(model).supportsVision) {
    throw new Error("当前 AI 图片模型不支持图片解析，请更换多模态模型或手动开启图片能力");
  }
}

function parseArguments(call: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(call.function.arguments) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`AI 工具 ${call.function.name} 的参数不是合法 JSON`, { cause: error });
  }
}

function knownToolName(value: string): AiToolName {
  if (value === "query_ledger" || value === "analyze_ledger" || value === "prepare_transaction") return value;
  throw new Error(`AI 请求了不允许的工具：${value}`);
}

function execution(toolName: AiToolName, content: unknown, drafts: readonly TransactionDraft[], completeLabel: string): ToolExecution {
  return { tool: toolName, content, transactionDrafts: drafts, startLabel: toolStartLabel(toolName), completeLabel };
}

function isAnalysisScope(value: unknown): value is AnalysisScope {
  return value === "current-month" || value === "last-3-months" || value === "last-6-months" || value === "year-to-date";
}

function tool(name: AiToolName, description: string, parameters: Record<string, unknown>) {
  return { type: "function", function: { name, description, parameters } };
}
