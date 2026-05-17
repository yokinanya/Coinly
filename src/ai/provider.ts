import type { AiSettings, AppData, TransactionDraft } from "../domain/types";
import { analysisScopeLabel, buildAnalysisContext, buildDraftSystemPrompt, type AnalysisScope } from "./context";
import { resolveAiModelCapabilities } from "./modelCapabilities";

export interface AiProvider {
  parseText(input: string, data: AppData): Promise<TransactionDraft>;
  parseImage(image: File, data: AppData): Promise<TransactionDraft>;
  analyze(data: AppData, options?: { readonly scope?: AnalysisScope }): Promise<string>;
}

export function buildAnalysisInput(data: AppData): string {
  return JSON.stringify(buildAnalysisContext(data, { settings: requireAiSettings(data.aiSettings) }));
}

interface ChatResponse {
  readonly choices: readonly {
    readonly message?: {
      readonly content?: string;
    };
  }[];
}

export function createAiProvider(settings?: AiSettings): AiProvider {
  if (!settings?.apiKey) {
    throw new Error("请先在设置中配置 AI API Key");
  }
  return new OpenAiCompatibleProvider(settings);
}

class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly settings: AiSettings) {}

  async parseText(input: string, data: AppData): Promise<TransactionDraft> {
    return requestDraft(this.settings, [
      buildDraftSystemPrompt(data, { settings: this.settings, input }),
      { role: "user", content: `解析这条记账文本，只返回 TransactionDraft JSON：${input}` },
    ]);
  }

  async parseImage(image: File, data: AppData): Promise<TransactionDraft> {
    assertVisionSupported(this.settings);
    const dataUrl = await readAsDataUrl(image);
    return requestDraft(this.settings, [
      buildDraftSystemPrompt(data, { settings: this.settings }),
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
    const response = await requestChat(this.settings, [
      { role: "system", content: analysisPrompt(analysisScopeLabel(scope)) },
      { role: "user", content: JSON.stringify(buildAnalysisContext(data, { settings: this.settings, analysisScope: scope })) },
    ]);
    return response.choices[0]?.message?.content ?? "";
  }
}

export function systemPrompt(data: AppData): Record<string, string> {
  return buildDraftSystemPrompt(data, { settings: requireAiSettings(data.aiSettings) });
}

function requireAiSettings(settings?: AiSettings): AiSettings {
  return settings ?? {
    provider: "openai-compatible",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "",
  };
}

function assertVisionSupported(settings: AiSettings): void {
  if (!resolveAiModelCapabilities(settings).supportsVision) {
    throw new Error("当前 AI 模型不支持图片解析，请在设置中更换多模态模型或手动开启图片能力");
  }
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

async function requestDraft(settings: AiSettings, messages: readonly unknown[]): Promise<TransactionDraft> {
  const response = await requestChat(settings, messages);
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI 未返回可解析内容");
  }
  return parseDraftContent(content);
}

async function requestChat(settings: AiSettings, messages: readonly unknown[]): Promise<ChatResponse> {
  const response = await fetch(chatCompletionsUrl(settings.endpoint), {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: settings.model, messages }),
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

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) return fenced;
  const object = balancedObject(trimmed);
  if (object) return object;
  throw new Error("AI 未返回 TransactionDraft JSON 对象");
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
