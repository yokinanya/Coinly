import { describe, expect, it } from "vitest";
import { initialData } from "../domain/factory";
import { buildAnalysisInput, chatCompletionsUrl, createAiProvider, parseDraftArrayContent, parseDraftContent, systemPrompt } from "./provider";

describe("buildAnalysisInput", () => {
  it("includes aggregated ledger context without full transactions", () => {
    const input = JSON.parse(buildAnalysisInput(initialData())) as Record<string, unknown>;

    expect(input).toHaveProperty("selectedRange");
    expect(input).toHaveProperty("budgets");
    expect(input).not.toHaveProperty("transactions");
    expect(input).toHaveProperty("contextMeta");
  });
});

describe("systemPrompt", () => {
  it("constrains draft fields and transaction kind values", () => {
    const content = systemPrompt(initialData()).content;

    expect(content).toContain("kind 只能从这些枚举中选择");
    expect(content).toContain("expense");
    expect(content).toContain("不要输出中文类型");
    expect(content).toContain("tagIds 必须是标签 id 数组");
    expect(content).toContain("不要输出具体时间");
  });
});

describe("parseImage", () => {
  it("rejects image parsing when the configured model does not support vision", async () => {
    const provider = createAiProvider({
      provider: "openai-compatible",
      endpoint: "https://api.openai.com/v1",
      model: "deepseek-chat",
      apiKey: "key",
    });

    await expect(provider.parseImage(new File([""], "receipt.png"), initialData())).rejects.toThrow("不支持图片解析");
  });
});

describe("parseDraftContent", () => {
  it("parses draft JSON from fenced model output", () => {
    const draft = parseDraftContent(`结果如下：\n\`\`\`json\n${JSON.stringify(sampleDraft())}\n\`\`\``);

    expect(draft).toMatchObject({ kind: "expense", amount: 12.5, currency: "CNY" });
  });

  it("parses the first balanced JSON object with braces inside strings", () => {
    const draft = parseDraftContent(`已解析 ${JSON.stringify({ ...sampleDraft(), note: "午餐 {优惠}" })} 请确认`);

    expect(draft.note).toBe("午餐 {优惠}");
  });

  it("rejects output without a JSON object", () => {
    expect(() => parseDraftContent("无法解析")).toThrow("AI 未返回 TransactionDraft JSON 对象");
  });
});

describe("parseDraftArrayContent", () => {
  it("parses draft arrays from fenced model output", () => {
    const drafts = parseDraftArrayContent(`结果如下：\n\`\`\`json\n${JSON.stringify([sampleDraft(), { ...sampleDraft(), amount: 38 }])}\n\`\`\``);

    expect(drafts).toHaveLength(2);
    expect(drafts[1]?.amount).toBe(38);
  });

  it("rejects output without a JSON array", () => {
    expect(() => parseDraftArrayContent(JSON.stringify(sampleDraft()))).toThrow("JSON 数组");
  });
});

describe("chatCompletionsUrl", () => {
  it("builds chat completions URL from a base URL", () => {
    expect(chatCompletionsUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("rejects a full chat completions request path", () => {
    expect(() => chatCompletionsUrl("https://api.openai.com/v1/chat/completions")).toThrow("Base URL");
  });
});

function sampleDraft() {
  return {
    kind: "expense",
    accountId: "cash",
    amount: 12.5,
    currency: "CNY",
    occurredAt: "2026-05-14T00:00:00.000Z",
    tagIds: [],
    note: "午餐",
  };
}
