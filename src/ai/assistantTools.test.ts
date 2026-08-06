import { describe, expect, it } from "vitest";
import { initialData } from "../domain/factory";
import type { AiSettings } from "../domain/types";
import { executeAssistantTool, ledgerTools } from "./assistantTools";
import { normalizeAiSettings } from "./settings";

describe("prepare_transactions", () => {
  it("applies the AI default payment account without overriding an explicit account", () => {
    const data = withAccounts();
    const defaults = execute(data, [
      candidate("expense"),
      candidate("transfer"),
      candidate("credit_payment", { accountId: "credit" }),
      candidate("income"),
    ]);
    const explicit = execute(data, [candidate("expense", { accountId: "explicit" })]);

    expect(defaults.candidates).toEqual([
      expect.objectContaining({ kind: "expense", accountId: "default" }),
      expect.objectContaining({ kind: "transfer", accountId: "default" }),
      expect.objectContaining({ kind: "credit_payment", accountId: "credit", relatedAccountId: "default" }),
      expect.objectContaining({ kind: "income", accountId: "default" }),
    ]);
    expect(explicit.candidates[0]).toEqual(expect.objectContaining({ accountId: "explicit" }));
  });

  it("preserves source image indexes and rejects invalid tool argument shapes", () => {
    const data = withAccounts();
    const result = execute(data, [candidate("expense", { sourceImageIndexes: [0, 2] })]);

    expect(result.candidates[0]?.sourceImageIndexes).toEqual([0, 2]);
    expect(() => executeRaw(data, "null")).toThrow("参数必须是对象");
    expect(() => executeRaw(data, "{\"candidates\":[],\"extra\":true}")).toThrow("未知字段");
  });

  it("does not expose source image indexes without images", () => {
    const prepareTool = ledgerTools(0).find((tool) => (tool as { function?: { name?: string } }).function?.name === "prepare_transactions") as {
      function: { parameters: { properties: Record<string, unknown> } };
    };
    expect(prepareTool.function.parameters.properties.sourceImageIndexes).toBeUndefined();
    expect(() => executeRaw(withAccounts(), JSON.stringify({ candidates: [candidate("expense", { sourceImageIndexes: [0] })] }), 0))
      .toThrow("引用了不存在的图片");
  });
});

function execute(data: ReturnType<typeof withAccounts>, candidates: readonly unknown[]) {
  return executeRaw(data, JSON.stringify({ candidates }));
}

function executeRaw(data: ReturnType<typeof withAccounts>, args: string, imageCount = 3) {
  const settings = normalizeAiSettings(data.aiSettings);
  return executeAssistantTool({
    call: {
      id: "call",
      type: "function",
      function: { name: "prepare_transactions", arguments: args },
    },
    data,
    model: settings.textModel,
    settings,
    imageCount,
  });
}

function candidate(kind: string, patch: Record<string, unknown> = {}) {
  return {
    kind,
    amount: 12,
    currency: "CNY",
    occurredAt: "2026-07-28",
    tagIds: [],
    note: "测试",
    ...patch,
  };
}

function withAccounts() {
  const data = initialData();
  const account = data.accounts[0];
  const aiSettings: AiSettings = {
    provider: "openai-compatible",
    endpoint: "https://example.test/v1",
    apiKey: "key",
    textModel: { model: "model" },
    defaultPaymentAccountId: "default",
  };
  return {
    ...data,
    accounts: [
      { ...account, id: "default", name: "默认" },
      { ...account, id: "explicit", name: "明确" },
      { ...account, id: "credit", name: "信用卡", kind: "credit" as const },
    ],
    aiSettings,
  };
}
