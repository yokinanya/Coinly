import { describe, expect, it } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData } from "../domain/types";
import { validateTransactionDraft } from "./validation";

describe("validateTransactionDraft", () => {
  it("normalizes common AI labels into local draft ids", () => {
    const data = dataWithTag();
    const result = validateTransactionDraft({
      kind: "消费",
      account: "日常账户",
      amount: "38",
      currency: "cny",
      category: "餐饮",
      tags: ["咖啡"],
      date: "2026-05-16",
      note: "星巴克",
    }, data);

    expect(result.valid).toBe(true);
    expect(result.draft).toMatchObject({
      kind: "expense",
      accountId: data.accounts[0].id,
      amount: 38,
      currency: "CNY",
      categoryId: data.categories[0].id,
      tagIds: [data.tags[0].id],
      occurredAt: "2026-05-16",
      note: "星巴克",
    });
  });

  it("drops time from AI dates", () => {
    const data = dataWithTag();
    const result = validateTransactionDraft({
      kind: "expense",
      account: "日常账户",
      amount: 38,
      currency: "CNY",
      date: "2026-05-16T22:10:00.000Z",
      note: "星巴克",
    }, data);

    expect(result.valid).toBe(true);
    expect(result.draft?.occurredAt).toBe("2026-05-16");
  });

  it("reports unmatched AI values explicitly", () => {
    const result = validateTransactionDraft({
      kind: "unknown",
      account: "不存在",
      amount: 10,
      currency: "AUD",
      tags: "咖啡",
      date: "not-a-date",
    }, initialData());

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("AI 返回的交易类型无法匹配现有类型");
    expect(result.errors).toContain("AI 返回的币种不在当前账本中");
    expect(result.errors).toContain("AI 返回的账户无法匹配当前账本");
    expect(result.errors).toContain("AI 返回的标签无法匹配当前账本");
    expect(result.errors).toContain("AI 返回的日期无法解析");
  });
});

function dataWithTag(): AppData {
  const data = initialData();
  return {
    ...data,
    tags: [{
      id: "tag-coffee",
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z",
      name: "咖啡",
    }],
  };
}
