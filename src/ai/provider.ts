import type { AiModelSettings, AiSettings, AppData, TransactionDraft } from "../domain/types";
import { analysisScopeLabel, buildAnalysisContext, buildDraftSystemPrompt, buildQueryContext, buildSuggestionContext, type AnalysisScope } from "./context";
import { resolveAiModelCapabilities } from "./modelCapabilities";
import { defaultAiSettings, normalizeAiSettings, selectTextModel, withAiSelection, type NormalizedAiSettings } from "./settings";
import type { CategoryTagSuggestion } from "./validation";

export interface AiProvider {
  parseText(input: string, data: AppData): Promise<TransactionDraft>;
  parseImage(image: File, data: AppData): Promise<TransactionDraft>;
  parseTextBatch(input: string, data: AppData): Promise<readonly TransactionDraft[]>;
  suggestCategoryTag(transaction: TransactionDraft, data: AppData): Promise<CategoryTagSuggestion>;
  analyze(data: AppData, options?: { readonly scope?: AnalysisScope }): Promise<string>;
  ask(question: string, data: AppData, image?: File): Promise<AiAssistantResponse>;
}

export interface AiAssistantResponse {
  readonly answer: string;
  readonly transactionDrafts: readonly TransactionDraft[];
}

export function buildAnalysisInput(data: AppData): string {
  const settings = requireAiSettings(data.aiSettings);
  return JSON.stringify(buildAnalysisContext(data, { settings: selectTextModel(settings) }));
}

interface ChatResponse {
  readonly choices: readonly {
    readonly message?: {
      readonly content?: string;
      readonly tool_calls?: readonly ToolCall[];
    };
  }[];
}

interface ToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

const LEDGER_TOOLS = [
  {
    type: "function",
    function: {
      name: "query_ledger",
      description: "查询账本的交易、分类、标签、预算和汇总数据。回答任何金额、消费、收入、类别或交易问题前都应调用。",
      parameters: {
        type: "object",
        properties: { question: { type: "string", description: "需要在账本中核对的具体问题" } },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_ledger",
      description: "按时间范围生成账本的聚合分析数据。仅在用户明确要求分析、趋势、报告、总结或风险时调用。",
      parameters: {
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
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_transaction",
      description: "当用户要求记录、记账、添加或创建交易时调用。工具只生成待确认交易，绝不会直接保存。",
      parameters: {
        type: "object",
        properties: { input: { type: "string", description: "需要解析的交易描述；图片场景可复述用户意图" } },
        required: ["input"],
        additionalProperties: false,
      },
    },
  },
] as const;

export function createAiProvider(settings?: AiSettings): AiProvider {
  const normalized = normalizeAiSettings(settings ?? defaultAiSettings());
  if (!normalized.apiKey) {
    throw new Error("请先在设置中配置 AI API Key");
  }
  return new OpenAiCompatibleProvider(normalized);
}

class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly settings: NormalizedAiSettings) {}

  async parseText(input: string, data: AppData): Promise<TransactionDraft> {
    const model = this.settings.textModel;
    return requestDraft(this.settings, model, [
      buildDraftSystemPrompt(data, { settings: model, input }),
      { role: "user", content: `解析这条记账文本，只返回 TransactionDraft JSON：${input}` },
    ]);
  }

  async parseTextBatch(input: string, data: AppData): Promise<readonly TransactionDraft[]> {
    const model = this.settings.textModel;
    return requestDrafts(this.settings, model, [
      buildDraftSystemPrompt(data, { settings: model, input, mode: "batch" }),
      { role: "user", content: `解析这批记账文本，只返回 TransactionDraft JSON 数组：${input}` },
    ]);
  }

  async parseImage(image: File, data: AppData): Promise<TransactionDraft> {
    const visionSettings = selectVisionSettings(this.settings);
    const model = visionSettings.textModel;
    assertVisionSupported(model);
    const dataUrl = await readAsDataUrl(image);
    return requestDraft(visionSettings, model, [
      buildDraftSystemPrompt(data, { settings: model }),
      {
        role: "user",
        content: [
          { type: "text", text: "解析截图中的单笔交易，只返回 TransactionDraft JSON。" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]);
  }

  async analyze(data: AppData, options: { readonly scope?: AnalysisScope } = {}): Promise<string> {
    const scope = options.scope ?? "current-month";
    const model = this.settings.textModel;
    const response = await requestChat(this.settings, model, [
      { role: "system", content: analysisPrompt(analysisScopeLabel(scope)) },
      { role: "user", content: JSON.stringify(buildAnalysisContext(data, { settings: model, analysisScope: scope })) },
    ]);
    return response.choices[0]?.message?.content ?? "";
  }

  async suggestCategoryTag(transaction: TransactionDraft, data: AppData): Promise<CategoryTagSuggestion> {
    const model = this.settings.textModel;
    const response = await requestChat(this.settings, model, [
      { role: "system", content: suggestionPrompt(buildSuggestionContext(data, { settings: model })) },
      { role: "user", content: JSON.stringify({ transaction }) },
    ]);
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("AI 未返回分类标签建议");
    }
    return parseSuggestionContent(content);
  }

  async ask(question: string, data: AppData, image?: File): Promise<AiAssistantResponse> {
    const model = this.settings.textModel;
    const content = image
      ? await imageQueryContent(model, question, image)
      : question;
    return requestToolAssistedAnswer(this.settings, model, data, image, question, [
      { role: "system", content: askPrompt() },
      { role: "user", content },
    ]);
  }
}

export function systemPrompt(data: AppData): Record<string, string> {
  const settings = requireAiSettings(data.aiSettings);
  return buildDraftSystemPrompt(data, { settings: selectTextModel(settings) });
}

function requireAiSettings(settings?: AiSettings): NormalizedAiSettings {
  return normalizeAiSettings(settings ?? defaultAiSettings());
}

function assertVisionSupported(settings: AiModelSettings): void {
  if (!resolveAiModelCapabilities(settings).supportsVision) {
    throw new Error("当前 AI 图片模型不支持图片解析，请在设置中更换多模态模型或手动开启图片能力");
  }
}

function selectVisionSettings(settings: NormalizedAiSettings): NormalizedAiSettings {
  for (const provider of settings.providers) {
    if (!provider.apiKey) continue;
    const model = provider.models.find((item) => item.id === settings.visionModel.id && item.model === settings.visionModel.model);
    if (model) return withAiSelection(settings, provider.id, model.id);
  }
  return settings;
}

async function imageQueryContent(model: AiModelSettings, context: string, image: File): Promise<readonly unknown[]> {
  assertVisionSupported(model);
  return [
    { type: "text", text: context },
    { type: "image_url", image_url: { url: await readAsDataUrl(image) } },
  ];
}

function analysisPrompt(scopeLabel: string): string {
  return [
    "你是 Coinly 的个人记账智能洞察助手，只基于用户提供的聚合上下文分析，不要编造数据。",
    `分析范围是“${scopeLabel}”。输出简洁中文 Markdown，使用这些小标题：${scopeLabel}概览、异常/风险、预算关注、趋势解释、行动建议。`,
    "异常/风险只写真实需要用户关注的消费波动、预算超支、分类结构问题；没有明确问题时写“暂无明确风险”。",
    "没有跨期对比数据时，不要声称结构稳定、改善、恶化或趋势明确；只能描述当前范围内的事实。",
    "只有存在重复交易或订阅规则证据时，才称某项支出为固定支出、周期支出或订阅支出。",
    "不要把币种汇总说成账户汇总；没有账户维度数据时不要写“CNY 账户”“USD 账户”。",
    "不要把商户名称或备注直接推断为分类是否缺失；只有 categoryId 为空时才建议补分类。",
    "涉及金额时必须带币种代码或币种名称，避免只写裸数字。",
    "不要分析多币种汇率风险，不要给外汇、汇率波动或换汇建议。",
    "不要做交易性质确认，不要讨论交易是否真实、是否完成、是否待核实；已录入交易一律视为已完成事实。",
    "报表中的负支出代表退款或支出抵扣；不要把退款或负支出列为异常，不要建议把退款改成收入。",
    "不要输出“符合统计口径”“符合 Coinly 的统计口径”“正常的退款”等规则解释式措辞；必要时只写“退款/抵扣减少了支出”。",
    "行动建议只能基于 Coinly 现有能力：分类、标签、预算、订阅规则、账期；不要提不存在或不精确的能力，例如预算提醒。",
    "只提供只读建议，不要声称已经创建、修改或删除任何交易、预算、订阅规则；建议不超过 3 条。",
  ].join("\n");
}

function suggestionPrompt(context: unknown): string {
  return [
    "你是 Coinly 的分类和标签建议助手。只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
    "JSON 字段只能包含 categoryId、tagIds、confidence。categoryId 必须来自上下文分类 id；tagIds 必须是上下文标签 id 数组；confidence 是 0 到 1 的数字。",
    "如果无法判断分类或标签，可以省略 categoryId 或输出空 tagIds。不要创建新分类或新标签。",
    `上下文：${JSON.stringify(context)}`,
  ].join("\n");
}

function askPrompt(): string {
  return [
    "你是 Coinly 的只读问账助手。需要账本事实时，必须通过提供的工具获取数据；不要编造数据。",
    "你自行判断是否以及何时调用工具，不要向用户展示工具、模式或内部路由。",
    "prepare_transaction 只生成待用户确认的候选交易，调用后必须明确说明尚未保存，等待用户确认。",
    "绝不能声称已经创建、修改或删除交易、分类、标签、预算或订阅。",
    "涉及金额时必须带币种代码或币种名称。没有足够数据时直接说明无法确定。",
    "输出简洁中文 Markdown；能给出可核对的分类、时间范围或交易备注时就写清楚。",
  ].join("\n");
}

async function requestToolAssistedAnswer(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  data: AppData,
  image: File | undefined,
  userQuestion: string,
  initialMessages: readonly unknown[],
): Promise<AiAssistantResponse> {
  const messages: unknown[] = [...initialMessages];
  const transactionDrafts: TransactionDraft[] = [];
  for (let round = 0; round < 4; round += 1) {
    const response = await requestChat(settings, model, messages, { tools: LEDGER_TOOLS });
    const message = response.choices[0]?.message;
    const calls = message?.tool_calls ?? [];
    if (calls.length === 0) return { answer: message?.content ?? "", transactionDrafts };
    messages.push({ role: "assistant", content: message?.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const result = await executeLedgerTool(call, data, model, settings, image, userQuestion);
      transactionDrafts.push(...result.transactionDrafts);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result.content),
      });
    }
  }
  throw new Error("AI 工具调用次数过多，请缩小问题范围后重试");
}

async function executeLedgerTool(
  call: ToolCall,
  data: AppData,
  model: AiModelSettings,
  settings: NormalizedAiSettings,
  image: File | undefined,
  userQuestion: string,
): Promise<{ readonly content: unknown; readonly transactionDrafts: readonly TransactionDraft[] }> {
  let argumentsValue: Record<string, unknown>;
  try {
    argumentsValue = JSON.parse(call.function.arguments) as Record<string, unknown>;
  } catch {
    return { content: { error: "工具参数不是合法 JSON" }, transactionDrafts: [] };
  }
  if (call.function.name === "query_ledger") {
    const question = typeof argumentsValue.question === "string" ? argumentsValue.question : "";
    return { content: question ? buildQueryContext(data, question, { settings: model }) : { error: "缺少 question 参数" }, transactionDrafts: [] };
  }
  if (call.function.name === "analyze_ledger") {
    const scope = argumentsValue.scope;
    return { content: isAnalysisScope(scope)
      ? buildAnalysisContext(data, { settings: model, analysisScope: scope })
      : { error: "scope 参数无效" }, transactionDrafts: [] };
  }
  if (call.function.name === "prepare_transaction") {
    const input = typeof argumentsValue.input === "string" && argumentsValue.input.trim() ? argumentsValue.input : userQuestion;
    const drafts = await prepareTransactionDrafts(settings, model, data, input, image);
    return { content: { candidates: drafts, requiresConfirmation: true }, transactionDrafts: drafts };
  }
  return { content: { error: `不允许调用工具 ${call.function.name}` }, transactionDrafts: [] };
}

async function prepareTransactionDrafts(settings: NormalizedAiSettings, model: AiModelSettings, data: AppData, input: string, image?: File): Promise<readonly TransactionDraft[]> {
  if (image) {
    const visionSettings = selectVisionSettings(settings);
    const visionModel = visionSettings.textModel;
    assertVisionSupported(visionModel);
    const draft = await requestDraft(visionSettings, visionModel, [
      buildDraftSystemPrompt(data, { settings: visionModel }),
      { role: "user", content: [{ type: "text", text: `根据图片和用户意图解析交易，只返回 TransactionDraft JSON：${input}` }, { type: "image_url", image_url: { url: await readAsDataUrl(image) } }] },
    ]);
    return [draft];
  }
  return requestDrafts(settings, model, [
    buildDraftSystemPrompt(data, { settings: model, input, mode: "batch" }),
    { role: "user", content: `解析交易描述，只返回 TransactionDraft JSON 数组：${input}` },
  ]);
}

function isAnalysisScope(value: unknown): value is AnalysisScope {
  return value === "current-month" || value === "last-3-months" || value === "last-6-months" || value === "year-to-date";
}

async function requestDraft(settings: NormalizedAiSettings, model: AiModelSettings, messages: readonly unknown[]): Promise<TransactionDraft> {
  const response = await requestChat(settings, model, messages);
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI 未返回可解析内容");
  }
  return parseDraftContent(content);
}

async function requestDrafts(settings: NormalizedAiSettings, model: AiModelSettings, messages: readonly unknown[]): Promise<readonly TransactionDraft[]> {
  const response = await requestChat(settings, model, messages);
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI 未返回可解析内容");
  }
  return parseDraftArrayContent(content);
}

async function requestChat(
  settings: NormalizedAiSettings,
  model: AiModelSettings,
  messages: readonly unknown[],
  options: { readonly tools?: readonly unknown[] } = {},
): Promise<ChatResponse> {
  if (!model.model.trim()) {
    throw new Error("请先在设置中配置 AI 模型");
  }
  const response = await fetch(chatCompletionsUrl(settings.endpoint), {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: model.model, messages, ...(options.tools ? { tools: options.tools, tool_choice: "auto" } : {}) }),
  });
  if (!response.ok) {
    throw new Error(`AI 调用失败：${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<ChatResponse>;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    throw new Error("AI Base URL 不能包含 /chat/completions");
  }
  if (!trimmed) {
    throw new Error("AI Base URL 不能为空");
  }
  return `${trimmed}/chat/completions`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function parseDraftContent(content: string): TransactionDraft {
  const json = extractJsonObject(content);
  try {
    return JSON.parse(json) as TransactionDraft;
  } catch (error) {
    const message = error instanceof Error ? `AI 返回的 JSON 无法解析：${error.message}` : "AI 返回的 JSON 无法解析";
    throw new Error(message, { cause: error });
  }
}

export function parseDraftArrayContent(content: string): readonly TransactionDraft[] {
  const json = extractJsonArray(content);
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("不是 JSON 数组");
    }
    return parsed as TransactionDraft[];
  } catch (error) {
    const message = error instanceof Error ? `AI 返回的 JSON 数组无法解析：${error.message}` : "AI 返回的 JSON 数组无法解析";
    throw new Error(message, { cause: error });
  }
}

function parseSuggestionContent(content: string): CategoryTagSuggestion {
  const json = extractJsonObject(content);
  try {
    return JSON.parse(json) as CategoryTagSuggestion;
  } catch (error) {
    const message = error instanceof Error ? `AI 返回的分类标签建议无法解析：${error.message}` : "AI 返回的分类标签建议无法解析";
    throw new Error(message, { cause: error });
  }
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) return fenced;
  const object = balancedObject(trimmed);
  if (object) return object;
  throw new Error("AI 未返回 TransactionDraft JSON 对象");
}

function extractJsonArray(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced?.startsWith("[") && fenced.endsWith("]")) return fenced;
  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  if (firstArray < 0 || (firstObject >= 0 && firstObject < firstArray)) {
    throw new Error("AI 未返回 TransactionDraft JSON 数组");
  }
  const array = balancedArray(trimmed);
  if (array) return array;
  throw new Error("AI 未返回 TransactionDraft JSON 数组");
}

function balancedObject(value: string): string | undefined {
  const start = value.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return value.slice(start, index + 1);
  }
  return undefined;
}

function balancedArray(value: string): string | undefined {
  const start = value.indexOf("[");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (depth === 0) return value.slice(start, index + 1);
  }
  return undefined;
}
