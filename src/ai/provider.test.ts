import { describe, expect, it } from "vitest";
import { initialData } from "../domain/factory";
import { buildAnalysisInput, chatCompletionsUrl, parseDraftContent, systemPrompt } from "./provider";

describe("buildAnalysisInput", () => {
  it("includes local transaction and budget data", () => {
    const input = JSON.parse(buildAnalysisInput(initialData())) as Record<string, unknown>;

    expect(input).toHaveProperty("transactions");
    expect(input).toHaveProperty("budgets");
    expect(input).toHaveProperty("categories");
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
