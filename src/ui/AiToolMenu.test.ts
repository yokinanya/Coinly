import { describe, expect, it } from "vitest";
import { aiToolQuery, explicitAiTool, insertAiToolMention, matchingAiTools, stripAiToolMention } from "./aiTools";

describe("AI tool mentions", () => {
  it("finds and inserts tool mentions", () => {
    expect(aiToolQuery("帮我 @分")).toBe("分");
    const tool = matchingAiTools("分")[0];
    expect(tool?.mode).toBe("analysis");
    expect(tool && insertAiToolMention("帮我 @分", tool)).toBe("帮我 @分析 ");
  });

  it("routes and strips a tool mention anywhere in the prompt", () => {
    expect(explicitAiTool("请 @分析 本月餐饮")).toMatchObject({ mode: "analysis" });
    expect(stripAiToolMention("请 @分析 本月餐饮")).toBe("请 本月餐饮");
  });
});