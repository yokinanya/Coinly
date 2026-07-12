import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import { TransactionTable } from "./TransactionTable";

describe("TransactionTable", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("restores advanced filters from the URL", () => {
    window.history.replaceState(null, "", "/transactions?categoryId=food");
    renderTable();

    const filterButton = screen.getByRole("button", { name: "筛选 1" });
    expect(filterButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "按分类筛选" })).toBeTruthy();
  });

  it("writes search state to the current URL", () => {
    window.history.replaceState(null, "", "/transactions");
    renderTable();

    fireEvent.change(screen.getByRole("textbox", { name: "搜索交易" }), { target: { value: "咖啡" } });
    expect(new URLSearchParams(window.location.search).get("q")).toBe("咖啡");
  });

  it("uses 20 rows per page by default", () => {
    window.history.replaceState(null, "", "/transactions");
    renderTable();

    expect(screen.getByText("20 / 页")).toBeTruthy();
  });
});

function renderTable() {
  const data = initialData();
  return render(
    <TransactionTable
      data={data}
      transactions={[]}
      accounts={{}}
      categories={{}}
      selectedIds={[]}
      setSelectedIds={vi.fn()}
      onEdit={vi.fn()}
      onRefund={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}