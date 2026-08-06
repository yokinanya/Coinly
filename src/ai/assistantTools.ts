import type { AiModelSettings, AppData, TransactionDraft } from "../domain/types";
import { analysisScopeLabel, buildAnalysisContext, type AnalysisScope } from "./analysisContext";
import { executeLedgerQuery, parseLedgerQuery } from "./ledgerQuery";
import type { NormalizedAiSettings } from "./settings";
import type { AiToolName, PreparedTransactionCandidate } from "./assistantTypes";
import type { ToolCall } from "./openAiTransport";

const TRANSACTION_KINDS = ["income", "expense", "refund", "transfer", "credit_payment"] as const;
const CANDIDATE_FIELDS = [
  "kind",
  "accountId",
  "amount",
  "currency",
  "occurredAt",
  "categoryId",
  "tagIds",
  "note",
  "relatedAccountId",
  "targetAmount",
  "targetCurrency",
  "sourceImageIndexes",
] as const;

export const LEDGER_TOOLS = [
  tool("read_ledger", [
    "读取本地账本并返回确定性结果。涉及金额、数量、账户、分类、标签、历史交易或趋势时调用。",
    "operation=query 时提供 metric 和 groupBy；operation=analyze 时提供 scope，或同时提供 startAt/endAt。",
    "不要自行计算或补全工具没有返回的数据。",
  ].join("\n"), {
    type: "object",
    properties: {
      operation: { type: "string", enum: ["query", "analyze"] },
      startAt: { type: "string", description: "可选的起始 ISO 日期" },
      endAt: { type: "string", description: "可选的结束 ISO 日期，包含当天" },
      scope: { type: "string", enum: ["current-month", "last-3-months", "last-6-months", "year-to-date"] },
      accountIds: stringArray("账户 ID"),
      categoryIds: stringArray("分类 ID"),
      tagIds: stringArray("标签 ID，需全部匹配"),
      kinds: { type: "array", items: { type: "string", enum: TRANSACTION_KINDS } },
      currencies: stringArray("币种代码"),
      metric: { type: "string", enum: ["count", "sum"] },
      groupBy: { type: "string", enum: ["none", "month", "account", "category", "tag", "kind", "currency"] },
    },
    required: ["operation"],
    additionalProperties: false,
  }),
  tool("prepare_transactions", [
    "当用户要求记账、添加或创建交易时调用；一次调用直接返回所有待确认候选，不得再次请求解析。",
    "只使用用户文字或图片能够确认的事实，不补造金额、日期或账户。amount 必须为正数，退款使用 refund。",
    "expense/refund 的 accountId 是支付或退款账户；transfer 的 accountId 是源账户、relatedAccountId 是目标账户；",
    "credit_payment 的 accountId 是信用卡、relatedAccountId 是还款来源。",
    "用户明确给出的账户优先。未给出账户时可省略对应字段，由 Coinly 应用默认账户。",
    "账户、分类、标签必须使用上下文 ID。note 只写商户或用途，不写解释。",
    "有图片时，多图可表示同一交易的多页或多笔交易；不得重复候选，sourceImageIndexes 使用从 0 开始的图片序号。没有图片时不要输出 sourceImageIndexes。",
  ].join("\n"), {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: TRANSACTION_KINDS },
            accountId: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            occurredAt: { type: "string" },
            categoryId: { type: "string" },
            tagIds: { type: "array", items: { type: "string" } },
            note: { type: "string" },
            relatedAccountId: { type: "string" },
            targetAmount: { type: "number" },
            targetCurrency: { type: "string" },
            sourceImageIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
          },
          additionalProperties: false,
        },
      },
    },
    required: ["candidates"],
    additionalProperties: false,
  }),
] as const;

export function ledgerTools(imageCount: number): readonly unknown[] {
  if (imageCount > 0) return LEDGER_TOOLS;
  return LEDGER_TOOLS.map((item) => item.function.name === "prepare_transactions"
    ? withoutImageIndexes(item)
    : item);
}

export interface ToolExecution {
  readonly tool: AiToolName;
  readonly content: unknown;
  readonly candidates: readonly PreparedTransactionCandidate[];
  readonly completeLabel: string;
  readonly traceSummary: string;
}

export function executeAssistantTool(options: {
  readonly call: ToolCall;
  readonly data: AppData;
  readonly model: AiModelSettings;
  readonly settings: NormalizedAiSettings;
  readonly imageCount?: number;
}): ToolExecution {
  const toolName = knownToolName(options.call.function.name);
  const args = parseArguments(options.call);
  if (toolName === "read_ledger") return readLedger(options.data, options.model, args);
  return prepareTransactions(options.data, options.settings.defaultPaymentAccountId, args, options.imageCount ?? 0);
}

export function toolStartLabel(name: AiToolName): string {
  if (name === "read_ledger") return "正在读取账本…";
  return "正在生成交易候选…";
}

export function knownToolName(value: string): AiToolName {
  if (value === "read_ledger" || value === "prepare_transactions") return value;
  throw new Error(`AI 请求了不允许的工具：${value}`);
}

function readLedger(data: AppData, model: AiModelSettings, args: Record<string, unknown>): ToolExecution {
  rejectUnknown(args, ["operation", "scope", "startAt", "endAt", "accountIds", "categoryIds", "tagIds", "kinds", "currencies", "metric", "groupBy"], "read_ledger");
  if (args.operation === "query") {
    const queryArgs = omitKeys(args, ["operation", "scope"]);
    const content = executeLedgerQuery(data, parseLedgerQuery(queryArgs));
    return execution("read_ledger", content, [], `已读取 ${content.matchedCount} 笔交易`, JSON.stringify(content));
  }
  if (args.operation !== "analyze") throw new Error("read_ledger 的 operation 无效");
  if (args.startAt !== undefined || args.endAt !== undefined) {
    if (typeof args.startAt !== "string" || typeof args.endAt !== "string") {
      throw new Error("read_ledger 自定义分析范围必须同时提供 startAt 和 endAt");
    }
    const content = executeLedgerQuery(data, parseLedgerQuery({
      startAt: args.startAt,
      endAt: args.endAt,
      metric: "sum",
      groupBy: "month",
    }));
    return execution("read_ledger", content, [], "已分析自定义范围", JSON.stringify(content));
  }
  if (!isAnalysisScope(args.scope)) throw new Error("read_ledger 的 scope 无效");
  const content = buildAnalysisContext(data, { settings: model, analysisScope: args.scope });
  return execution("read_ledger", content, [], `已分析${analysisScopeLabel(args.scope)}`, JSON.stringify(content));
}

function prepareTransactions(
  data: AppData,
  defaultAccountId: string | undefined,
  args: Record<string, unknown>,
  imageCount: number,
): ToolExecution {
  rejectUnknown(args, ["candidates"], "prepare_transactions");
  if (!Array.isArray(args.candidates)) throw new Error("prepare_transactions 的 candidates 必须是数组");
  const candidates = args.candidates.map((value, index) => parseCandidate(value, index, imageCount));
  const normalized = candidates.map((candidate) => applyDefaultAccount(data, candidate, defaultAccountId));
  const content = { candidates: normalized, requiresConfirmation: true };
  return execution("prepare_transactions", content, normalized, `已生成 ${normalized.length} 笔候选`, JSON.stringify(content));
}

function parseCandidate(value: unknown, index: number, imageCount: number): PreparedTransactionCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`prepare_transactions 的第 ${index + 1} 个候选必须是对象`);
  }
  const candidate = value as Record<string, unknown>;
  rejectUnknown(candidate, CANDIDATE_FIELDS, "prepare_transactions candidate");
  if (candidate.kind !== undefined && !TRANSACTION_KINDS.includes(candidate.kind as TransactionDraft["kind"])) {
    throw new Error(`prepare_transactions 的第 ${index + 1} 个候选 kind 无效`);
  }
  if (candidate.sourceImageIndexes !== undefined && !validImageIndexes(candidate.sourceImageIndexes)) {
    throw new Error(`prepare_transactions 的第 ${index + 1} 个候选图片序号无效`);
  }
  if (Array.isArray(candidate.sourceImageIndexes) && candidate.sourceImageIndexes.some((item) => item >= imageCount)) {
    throw new Error(`prepare_transactions 的第 ${index + 1} 个候选引用了不存在的图片`);
  }
  return candidate as PreparedTransactionCandidate;
}

function applyDefaultAccount(
  data: AppData,
  candidate: PreparedTransactionCandidate,
  defaultAccountId: string | undefined,
): PreparedTransactionCandidate {
  if (!defaultAccountId || !data.accounts.some((account) => account.id === defaultAccountId)) return candidate;
  if ((candidate.kind === "income" || candidate.kind === "expense" || candidate.kind === "refund" || candidate.kind === "transfer") && !candidate.accountId) {
    return { ...candidate, accountId: defaultAccountId };
  }
  if (candidate.kind === "credit_payment" && !candidate.relatedAccountId) {
    return { ...candidate, relatedAccountId: defaultAccountId };
  }
  return candidate;
}

function withoutImageIndexes(toolDefinition: (typeof LEDGER_TOOLS)[number]) {
  if (toolDefinition.function.name !== "prepare_transactions") return toolDefinition;
  const properties = toolDefinition.function.parameters.properties as Record<string, unknown>;
  const withoutSourceImageIndexes = omitKeys(properties, ["sourceImageIndexes"]);
  return {
    ...toolDefinition,
    function: {
      ...toolDefinition.function,
      description: toolDefinition.function.description.replace("有图片时，多图可表示同一交易的多页或多笔交易；不得重复候选，sourceImageIndexes 使用从 0 开始的图片序号。没有图片时不要输出 sourceImageIndexes。", "当前消息没有图片，不要输出 sourceImageIndexes。"),
      parameters: { ...toolDefinition.function.parameters, properties: withoutSourceImageIndexes },
    },
  };
}

function parseArguments(call: ToolCall): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(call.function.arguments);
  } catch (error) {
    throw new Error(`AI 工具 ${call.function.name} 的参数不是合法 JSON`, { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`AI 工具 ${call.function.name} 的参数必须是对象`);
  }
  return value as Record<string, unknown>;
}

function execution(
  tool: AiToolName,
  content: unknown,
  candidates: readonly PreparedTransactionCandidate[],
  completeLabel: string,
  traceSummary: string,
): ToolExecution {
  return { tool, content, candidates, completeLabel, traceSummary };
}

function isAnalysisScope(value: unknown): value is AnalysisScope {
  return value === "current-month" || value === "last-3-months" || value === "last-6-months" || value === "year-to-date";
}

function validImageIndexes(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0);
}

function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[], toolName: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${toolName} 包含未知字段：${unknown.join(", ")}`);
}

function omitKeys(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function stringArray(description: string) {
  return { type: "array", items: { type: "string" }, description };
}

function tool(name: AiToolName, description: string, parameters: Record<string, unknown>) {
  return { type: "function", function: { name, description, parameters } };
}
