import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "../domain/types";
import { initialData } from "../domain/factory";
import { AiProviderManagerDialog } from "./AiProviderManager";

const { fetchAiProviderModels } = vi.hoisted(() => ({
  fetchAiProviderModels: vi.fn<() => Promise<readonly string[]>>(),
}));

vi.mock("../ai/providerModels", () => ({ fetchAiProviderModels }));

beforeEach(() => fetchAiProviderModels.mockReset());
afterEach(cleanup);

describe("AiProviderManagerDialog", () => {
  it("adds a provider with multiple models and persists only on save", () => {
    const onSave = vi.fn();
    render(<AiProviderManagerDialog settings={settings()} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    fireEvent.change(screen.getByRole("textbox", { name: "显示名称" }), { target: { value: "OpenRouter" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Base URL" }), { target: { value: "https://openrouter.ai/api/v1" } });
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "router-key" } });
    fireEvent.change(screen.getByRole("textbox", { name: "模型显示名称" }), { target: { value: "GPT 5" } });
    fireEvent.change(screen.getByRole("textbox", { name: "模型 ID" }), { target: { value: "openai/gpt-5" } });
    fireEvent.click(screen.getByRole("button", { name: "添加模型" }));
    expect(screen.getByRole("button", { name: "已添加" })).toBeTruthy();
    expect(screen.getByText("已添加新模型，请填写模型 ID。")).toBeTruthy();
    fireEvent.change(screen.getAllByRole("textbox", { name: "模型 ID" })[1], { target: { value: "google/gemini-3-pro" } });

    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    const saved = onSave.mock.calls[0][0] as AiSettings;
    expect(saved.providers).toHaveLength(2);
    expect(saved.providers?.[1]).toMatchObject({ name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1", apiKey: "router-key" });
    expect(saved.providers?.[1]?.models[0]?.name).toBe("GPT 5");
    expect(saved.providers?.[1]?.models.map((model) => model.model)).toEqual(["openai/gpt-5", "google/gemini-3-pro"]);
  });

  it("sets the current provider and confirms provider deletion", () => {
    const onSave = vi.fn();
    render(<AiProviderManagerDialog settings={settingsWithSecondary()} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByText("Secondary"));
    fireEvent.click(screen.getByRole("button", { name: "设为当前" }));
    fireEvent.click(screen.getByRole("button", { name: "删除提供商 Secondary" }));
    expect(screen.getByRole("dialog", { name: "删除提供商" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    const saved = onSave.mock.calls[0][0] as AiSettings;
    expect(saved.providers).toHaveLength(1);
    expect(saved.providers?.[0]?.id).toBe("primary");
  });

  it("fetches and selectively imports models that are not configured", async () => {
    const onSave = vi.fn();
    fetchAiProviderModels.mockResolvedValue(["gpt-4.1-mini", "new-chat-model", "new-vision-model"]);
    render(<AiProviderManagerDialog settings={settings()} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "获取模型" }));
    expect(await screen.findByRole("dialog", { name: "从 OpenAI 获取模型" })).toBeTruthy();
    expect(await screen.findByRole("checkbox", { name: "new-chat-model" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "gpt-4.1-mini" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "new-chat-model" }));
    fireEvent.click(screen.getByRole("button", { name: "导入选中 1" }));

    expect(screen.getByText("已导入 1 个模型。")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    const saved = onSave.mock.calls[0][0] as AiSettings;
    expect(saved.providers?.[0]?.models.map((model) => model.model)).toContain("new-chat-model");
  });

  it("persists the AI default payment account independently of the model", () => {
    const onSave = vi.fn();
    const data = initialData();
    render(<AiProviderManagerDialog settings={settings()} accounts={data.accounts} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "AI 默认支付账户" }));
    fireEvent.click(screen.getByRole("option", { name: /日常账户/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    expect(onSave.mock.calls[0][0]).toMatchObject({ defaultPaymentAccountId: data.accounts[0].id });
  });

});

function settings(): AiSettings {
  return {
    provider: "openai-compatible",
    endpoint: "https://api.openai.com/v1",
    apiKey: "openai-key",
    textModel: { model: "gpt-4.1-mini" },
    visionModel: { model: "gpt-4o-mini", supportsVision: true },
  };
}

function settingsWithSecondary(): AiSettings {
  return {
    ...settings(),
    providers: [
      { id: "primary", name: "Primary", protocol: "openai-compatible", endpoint: "https://api.openai.com/v1", apiKey: "one", defaultModelId: "chat", models: [{ id: "chat", model: "gpt-4.1-mini" }] },
      { id: "secondary", name: "Secondary", protocol: "openai-compatible", endpoint: "https://api.example/v1", apiKey: "two", defaultModelId: "reasoning", models: [{ id: "reasoning", model: "reasoning-model" }] },
    ],
    activeProviderId: "primary",
    activeModelId: "chat",
  };
}
