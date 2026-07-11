import { describe, expect, it } from "vitest";
import type { AiSettings } from "../domain/types";
import { resolveAiModelCapabilities } from "./modelCapabilities";
import { normalizeAiSettings, selectActiveModel, selectActiveProvider, selectVisionModel } from "./settings";

describe("resolveAiModelCapabilities", () => {
  it("uses model presets for large and medium context windows", () => {
    expect(resolveAiModelCapabilities(settings("gemini-3-pro")).contextBudget.inputTokens).toBe(1_000_000);
    expect(resolveAiModelCapabilities(settings("grok-4.20")).contextBudget.inputTokens).toBe(256_000);
  });

  it("detects vision and text-only models", () => {
    expect(resolveAiModelCapabilities(settings("gpt-5.5")).supportsVision).toBe(true);
    expect(resolveAiModelCapabilities(settings("deepseek-chat")).supportsVision).toBe(false);
  });

  it("covers common current model families", () => {
    expect(resolveAiModelCapabilities(settings("gpt-5.4-mini")).contextBudget.inputTokens).toBe(1_050_000);
    expect(resolveAiModelCapabilities(settings("mimo-v2.5")).contextBudget.inputTokens).toBe(1_048_576);
    expect(resolveAiModelCapabilities(settings("mimo-v2.5")).supportsVision).toBe(true);
    expect(resolveAiModelCapabilities(settings("mimo-v2-omni")).supportsVision).toBe(true);
    expect(resolveAiModelCapabilities(settings("mimo-v2.5-pro")).supportsVision).toBe(false);
    expect(resolveAiModelCapabilities(settings("mimo-v2-pro")).supportsVision).toBe(false);
    expect(resolveAiModelCapabilities(settings("mimo-v2-flash")).supportsVision).toBe(false);
    expect(resolveAiModelCapabilities(settings("mimo-v2.5-vl")).contextBudget.source).toBe("default");
    expect(resolveAiModelCapabilities(settings("grok-4.3-fast")).supportsVision).toBe(true);
    expect(resolveAiModelCapabilities(settings("qwen3-vl-plus")).supportsVision).toBe(true);
    expect(resolveAiModelCapabilities(settings("kimi-k2")).supportsVision).toBe(false);
    expect(resolveAiModelCapabilities(settings("claude-sonnet-4.5")).contextBudget.inputTokens).toBe(200_000);
    expect(resolveAiModelCapabilities(settings("deepseek/deepseek-v4-flash")).contextBudget.source).toBe("preset");
    expect(resolveAiModelCapabilities(settings("deepseek/deepseek-v4-flash")).supportsVision).toBe(false);
    expect(resolveAiModelCapabilities(settings("deepseek/deepseek-v4-pro")).supportsVision).toBe(false);
  });

  it("lets manual settings override presets", () => {
    const capabilities = resolveAiModelCapabilities({
      ...settings("deepseek-chat"),
      contextTokenBudget: 32_000,
      supportsVision: true,
    });

    expect(capabilities.contextBudget).toMatchObject({ inputTokens: 32_000, source: "manual" });
    expect(capabilities.supportsVision).toBe(true);
  });

  it("resolves per-model settings independently", () => {
    expect(resolveAiModelCapabilities({ model: "deepseek-chat" }).supportsVision).toBe(false);
    expect(resolveAiModelCapabilities({ model: "deepseek-chat", supportsVision: true }).supportsVision).toBe(true);
  });

  it("normalizes legacy single-model settings into model slots", () => {
    const normalized = normalizeAiSettings({
      provider: "openai-compatible",
      endpoint: "https://api.example/v1/chat/completions",
      model: "legacy-text",
      apiKey: "key",
      contextTokenBudget: 32_000,
      supportsVision: false,
    });

    expect(normalized.endpoint).toBe("https://api.example/v1");
    expect(normalized.textModel).toMatchObject({ model: "legacy-text", contextTokenBudget: 32_000, supportsVision: false });
    expect(selectVisionModel(normalized).model).not.toBe("legacy-text");
    expect(normalized.providers).toHaveLength(1);
    expect(normalized.providers[0]).toMatchObject({ id: "default", endpoint: "https://api.example/v1", apiKey: "key" });
  });

  it("selects an enabled provider and model from the provider registry", () => {
    const normalized = normalizeAiSettings({
      provider: "openai-compatible",
      endpoint: "",
      apiKey: "",
      activeProviderId: "secondary",
      activeModelId: "reasoning",
      providers: [
        { id: "primary", name: "Primary", protocol: "openai-compatible", endpoint: "https://one.example/v1", apiKey: "one", models: [{ id: "chat", model: "chat-model" }] },
        { id: "secondary", name: "Secondary", protocol: "openai-compatible", endpoint: "https://two.example/v1/chat/completions", apiKey: "two", defaultModelId: "chat", models: [{ id: "chat", model: "chat-model" }, { id: "reasoning", model: "reasoning-model" }] },
      ],
    });

    expect(selectActiveProvider(normalized)).toMatchObject({ id: "secondary", endpoint: "https://two.example/v1", apiKey: "two" });
    expect(selectActiveModel(normalized)).toMatchObject({ id: "reasoning", model: "reasoning-model" });
    expect(normalized).toMatchObject({ endpoint: "https://two.example/v1", apiKey: "two", model: "reasoning-model" });
  });

  it("keeps explicitly empty model fields empty", () => {
    const normalized = normalizeAiSettings({
      provider: "openai-compatible",
      endpoint: "https://api.example/v1",
      apiKey: "key",
      textModel: { model: "" },
      visionModel: { model: "   " },
    });

    expect(normalized.textModel.model).toBe("");
    expect(normalized.visionModel.model).toBe("");
  });

  it("uses conservative defaults for unknown models", () => {
    const capabilities = resolveAiModelCapabilities(settings("local-model"));

    expect(capabilities.contextBudget.source).toBe("default");
    expect(capabilities.supportsVision).toBe(false);
  });

  it("rejects invalid manual budgets explicitly", () => {
    expect(() => resolveAiModelCapabilities({ ...settings("gpt-5.4-mini"), contextTokenBudget: 100 })).toThrow("上下文预算");
  });
});

function settings(model: string): AiSettings {
  return {
    provider: "openai-compatible",
    endpoint: "https://api.openai.com/v1",
    model,
    apiKey: "key",
  };
}
