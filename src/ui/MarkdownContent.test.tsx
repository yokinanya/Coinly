import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders common LLM Markdown without injecting raw HTML", () => {
    render(<MarkdownContent plain content={"## 概览\n\n- **餐饮** `38 CNY`\n1. 第一项\n\n| 分类 | 金额 |\n| --- | ---: |\n| 餐饮 | 38 CNY |\n\n[查看说明](https://example.com)\n\n```json\n{\"amount\": 38}\n```\n<script>alert(1)</script>"} />);

    expect(screen.getByRole("heading", { name: "概览" })).toBeTruthy();
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "分类" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "38 CNY" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看说明" }).getAttribute("href")).toBe("https://example.com");
    expect(screen.getByText('{"amount": 38}')).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});