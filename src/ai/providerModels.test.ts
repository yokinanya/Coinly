import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiProviderSettings } from "../domain/types";
import { aiModelsUrl, fetchAiProviderModels, parseModelIds } from "./providerModels";

afterEach(() => vi.restoreAllMocks());

describe("fetchAiProviderModels", () => {
  it("requests the OpenAI-compatible models endpoint with provider credentials", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "gpt-4.1-mini" }, { id: "gpt-4o-mini" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(fetchAiProviderModels(provider())).resolves.toEqual(["gpt-4.1-mini", "gpt-4o-mini"]);
    expect(fetch).toHaveBeenCalledWith("https://api.example/v1/models", {
      headers: { accept: "application/json", authorization: "Bearer secret" },
    });
  });

  it("reports incompatible or failed model endpoints", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404, statusText: "Not Found" })));

    await expect(fetchAiProviderModels(provider())).rejects.toThrow("获取模型失败：404 Not Found");
  });
});

describe("model list parsing", () => {
  it("normalizes alternate model arrays and removes duplicates", () => {
    expect(parseModelIds({ models: ["beta", { id: "alpha" }, { id: "alpha" }, { name: "ignored" }] })).toEqual(["alpha", "beta"]);
  });

  it("builds a models URL from chat-completions endpoints", () => {
    expect(aiModelsUrl("https://api.example/v1/chat/completions")).toBe("https://api.example/v1/models");
  });
});

function provider(): AiProviderSettings {
  return {
    id: "provider",
    name: "Provider",
    protocol: "openai-compatible",
    endpoint: "https://api.example/v1/chat/completions",
    apiKey: "secret",
    models: [],
  };
}