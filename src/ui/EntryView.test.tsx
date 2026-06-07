import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData } from "../domain/types";
import { EntryView } from "./EntryView";

vi.mock("./toastApi", () => ({
  Message: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

describe("EntryView", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows manual entry fields by default and saves a valid transaction", async () => {
    const data = initialData();
    const setData = vi.fn();

    renderEntry(data, setData);
    expect(screen.getByRole("heading", { name: "记账" })).toBeTruthy();
    expect(screen.getByText("金额")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("0"), { target: { value: "12" } });
    fireEvent.click(screen.getByText("保存交易"));

    await waitFor(() => expect(setData).toHaveBeenCalledTimes(1));
    const saved = setData.mock.calls[0][0] as AppData;
    expect(saved.transactions).toHaveLength(1);
    expect(saved.transactions[0]?.amount).toBe(12);
  });

  it("shows manual field errors and focuses the first invalid field", async () => {
    const data = initialData();
    const setData = vi.fn();

    renderEntry(data, setData);
    fireEvent.click(screen.getByText("保存交易"));

    const error = await screen.findByText("金额必须大于 0");
    expect(error).toBeTruthy();
    expect(setData).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByDisplayValue("0")));
  });
});

function renderEntry(data: AppData, setData: (data: AppData) => void) {
  return render(<EntryView data={data} setData={setData} />);
}