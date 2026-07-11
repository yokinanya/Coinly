import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import { DashboardView } from "./DashboardView";

describe("DashboardView", () => {
  afterEach(() => cleanup());

  it("shows a concise monthly summary and exposes quick entry", () => {
    const onNavigate = vi.fn();
    render(<DashboardView data={initialData()} setData={vi.fn()} onNavigate={onNavigate} />);

    expect(screen.getByRole("heading", { name: "本月收支" })).toBeTruthy();
    expect(screen.getByText("0 笔流水")).toBeTruthy();
    expect(screen.getByText("本月暂无收支，记下第一笔后会在这里汇总。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "记一笔" }));
    expect(onNavigate).toHaveBeenCalledWith("entry");
  });
});