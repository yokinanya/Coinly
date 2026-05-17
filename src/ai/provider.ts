import { TRANSACTION_KINDS } from "../domain/constants";
import type { AiSettings, AppData, TransactionDraft } from "../domain/types";

export interface AiProvider {
  parseText(input: string, data: AppData): Promise<TransactionDraft>;
  parseImage(image: File, data: AppData): Promise<TransactionDraft>;
  analyze(data: AppData): Promise<string>;
}

export function buildAnalysisInput(data: AppData): string {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return JSON.stringify({
    month,
    transactions: data.transactions,
    budgets: data.budgets,
    categories: data.categories,
    tags: data.tags,
  });
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
      systemPrompt(data),
      { role: "user", content: `解析这条记账文本，只返回 TransactionDraft JSON：${input}` },
    ]);
  }

  async parseImage(image: File, data: AppData): Promise<TransactionDraft> {
    const dataUrl = await readAsDataUrl(image);
    return requestDraft(this.settings, [
      systemPrompt(data),
      {
        role: "user",
        content: [
          { type: "text", text: "解析截图中的单笔交易，只返回 TransactionDraft JSON。" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]);
  }

  async analyze(data: AppData): Promise<string> {
    const response = await requestChat(this.settings, [
      { role: "system", content: "你是个人记账分析助手，基于数据给出简洁建议。" },
      { role: "user", content: buildAnalysisInput(data) },
    ]);
    return response.choices[0]?.message?.content ?? "";
  }
}

export function systemPrompt(data: AppData): Record<string, string> {
  return {
    role: "system",
    content: [
      "你是 Coinly 的记账解析器。只输出一个合法 JSON 对象，不要 Markdown，不要解释。",
      "JSON 必须符合 TransactionDraft：kind, accountId, amount, currency, occurredAt, tagIds, note 为必填字段。",
      `kind 只能从这些枚举中选择：${TRANSACTION_KINDS.join(", ")}。不要输出中文类型，不要发明新类型。`,
      "常见映射：消费/付款/买东西=expense，工资/收款=income，退款/退货=refund，转账=transfer，信用卡还款=credit_payment。",
      "accountId 必须使用下方账户的 id；categoryId 必须使用下方分类的 id；tagIds 必须是标签 id 数组，没有标签时输出 []。",
      "currency 必须使用当前账本币种代码；occurredAt 只输出日期，不要输出具体时间；amount 必须是正数。",
      "无法确定分类或标签时省略 categoryId 或使用空 tagIds，不要输出不存在的名称。",
      `当前日期：${new Date().toISOString()}`,
      `币种：${JSON.stringify(data.currencies)}`,
      `账户：${JSON.stringify(selectableItems(data.accounts))}`,
      `分类：${JSON.stringify(selectableCategories(data))}`,
      `标签：${JSON.stringify(selectableItems(data.tags))}`,
    ].join("\n"),
  };
}

function selectableItems(items: readonly { readonly id: string; readonly name: string }[]) {
  return items.map((item) => ({ id: item.id, name: item.name }));
}

function selectableCategories(data: AppData) {
  return data.categories.map((item) => ({ id: item.id, name: item.name, direction: item.direction }));
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
