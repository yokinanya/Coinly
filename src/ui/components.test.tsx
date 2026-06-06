import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "./components";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
] as const;

describe("Select", () => {
  afterEach(() => cleanup());

  it("supports keyboard navigation and returns focus after selecting", async () => {
    const onChange = vi.fn();
    render(<Select value="" options={OPTIONS} onChange={onChange} />);

    const trigger = screen.getByRole("button");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("option", { name: "Alpha" })));

    fireEvent.keyDown(screen.getByRole("option", { name: "Alpha" }), { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("option", { name: "Beta" })));

    fireEvent.keyDown(screen.getByRole("option", { name: "Beta" }), { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("option", { name: "Gamma" })));

    fireEvent.keyDown(screen.getByRole("option", { name: "Gamma" }), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("c");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("closes with Escape and keeps multi-select open after Space toggles", async () => {
    const onChange = vi.fn();
    render(<Select mode="multiple" value={[]} options={OPTIONS} onChange={onChange} />);

    const trigger = screen.getByRole("button");
    fireEvent.keyDown(trigger, { key: " " });
    const first = screen.getByRole("option", { name: "Alpha" });
    await waitFor(() => expect(document.activeElement).toBe(first));

    fireEvent.keyDown(first, { key: " " });
    expect(onChange).toHaveBeenCalledWith(["a"]);
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(first, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});