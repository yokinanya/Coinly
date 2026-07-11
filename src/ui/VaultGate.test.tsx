import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VaultGate } from "./VaultGate";

describe("VaultGate", () => {
  afterEach(() => cleanup());

  it("keeps recovery options collapsed and submits the create form", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <VaultGate
        state={{ kind: "empty" }}
        status={{ tone: "info", text: "请先创建本地账本" }}
        onSubmit={onSubmit}
      />,
    );

    const form = screen.getByRole("form", { name: "创建账本" });
    expect(screen.queryByRole("button", { name: "导入全量数据文件" })).toBeNull();

    fireEvent.change(screen.getByLabelText("账本口令"), { target: { value: "correct horse" } });
    fireEvent.submit(form);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      passphrase: "correct horse",
      rememberDevice: true,
      syncSettingsPackage: undefined,
      fullDataPackage: undefined,
    }));
  });

  it("reveals recovery options only while creating a vault", () => {
    render(
      <VaultGate
        state={{ kind: "empty" }}
        status={{ tone: "info", text: "" }}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "从备份恢复" }));
    expect(screen.getByRole("button", { name: "导入全量数据文件" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "导入同步源配置" })).toBeTruthy();
  });
});