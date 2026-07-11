import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import { SettingsView } from "./SettingsView";

afterEach(cleanup);

describe("SettingsView", () => {
  it("keeps only unique settings categories", () => {
    render(
      <SettingsView
        data={initialData()}
        token={{ version: 1 }}
        setData={vi.fn()}
        setVaultData={vi.fn()}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "设置分类" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual(["同步", "币种", "数据与安全"]);
    expect(within(navigation).queryByRole("link", { name: "AI" })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "账本管理" })).toBeNull();
    expect(screen.getByRole("heading", { name: "数据管理" })).toBeTruthy();
  });
});