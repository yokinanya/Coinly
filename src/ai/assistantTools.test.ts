import { describe, expect, it } from "vitest";
import { initialData } from "../domain/factory";
import type { AiSettings } from "../domain/types";
import { executeAssistantTool } from "./assistantTools";
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
      expect.not.objectContaining({ accountId: "default" }),
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
});

function execute(data: ReturnType<typeof withAccounts>, candidates: readonly unknown[]) {
  return executeRaw(data, JSON.stringify({ candidates }));
}

function executeRaw(data: ReturnType<typeof withAccounts>, args: string) {
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
    imageCount: 3,
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
