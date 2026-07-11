import type { AiProviderSettings } from "../domain/types";
import { normalizeAiEndpoint } from "./settings";

export async function fetchAiProviderModels(provider: AiProviderSettings): Promise<readonly string[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (provider.apiKey.trim()) headers.authorization = `Bearer ${provider.apiKey}`;
  const response = await fetch(aiModelsUrl(provider.endpoint), { headers });
  if (!response.ok) {
    throw new Error(`获取模型失败：${response.status} ${response.statusText}`);
  }
  const modelIds = parseModelIds(await response.json());
  if (modelIds.length === 0) throw new Error("提供商未返回可用模型");
  return modelIds;
}

export function aiModelsUrl(endpoint: string): string {
  const baseUrl = normalizeAiEndpoint(endpoint).replace(/\/+$/, "");
  if (!baseUrl) throw new Error("AI Base URL 不能为空");
  return `${baseUrl}/models`;
}

export function parseModelIds(payload: unknown): readonly string[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { readonly data?: unknown; readonly models?: unknown };
  const values = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : [];
  const modelIds = values.flatMap((value) => {
    if (typeof value === "string") return [value.trim()];
    if (!value || typeof value !== "object") return [];
    const id = (value as { readonly id?: unknown }).id;
    return typeof id === "string" ? [id.trim()] : [];
  }).filter(Boolean);
  return [...new Set(modelIds)].sort((left, right) => left.localeCompare(right));
}