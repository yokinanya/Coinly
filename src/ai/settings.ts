import type { AiModelSettings, AiProviderSettings, AiSettings } from "../domain/types";

export const DEFAULT_AI_ENDPOINT = "https://api.openai.com/v1";
export const DEFAULT_TEXT_MODEL = "gpt-4.1-mini";
export const DEFAULT_VISION_MODEL = "gpt-4o-mini";

export interface NormalizedAiModelSettings extends AiModelSettings {
  readonly id: string;
}

export interface NormalizedAiProviderSettings extends AiProviderSettings {
  readonly models: readonly NormalizedAiModelSettings[];
  readonly defaultModelId: string;
}

export interface NormalizedAiSettings extends AiSettings {
  readonly provider: "openai-compatible";
  readonly endpoint: string;
  readonly apiKey: string;
  readonly providers: readonly NormalizedAiProviderSettings[];
  readonly activeProviderId: string;
  readonly activeModelId: string;
  readonly textModel: AiModelSettings;
  readonly visionModel: AiModelSettings;
}

export function defaultAiSettings(): NormalizedAiSettings {
  return normalizeAiSettings({
    provider: "openai-compatible",
    endpoint: DEFAULT_AI_ENDPOINT,
    apiKey: "",
    textModel: { model: DEFAULT_TEXT_MODEL },
    visionModel: { model: DEFAULT_VISION_MODEL },
  });
}

export function normalizeAiSettings(settings?: AiSettings): NormalizedAiSettings {
  const providers = normalizeProviders(settings);
  const activeProvider = selectConfiguredProvider(providers, settings?.activeProviderId);
  const activeModel = selectConfiguredModel(activeProvider, settings?.activeModelId);
  const availableModels = providers.flatMap((provider) => provider.models);
  const visionModel = settings?.providers?.length
    ? availableModels.find((model) => model.supportsVision)
      ?? availableModels.find((model) => isKnownVisionModel(model.model))
      ?? activeModel
    : normalizeModelSettings(settings?.visionModel ?? legacyVisionModel(activeModel), "vision");

  return normalizedSettings(settings, providers, activeProvider, activeModel, visionModel);
}

export function selectActiveProvider(settings: AiSettings): NormalizedAiProviderSettings {
  const normalized = normalizeAiSettings(settings);
  return normalized.providers.find((provider) => provider.id === normalized.activeProviderId) ?? normalized.providers[0];
}

export function selectActiveModel(settings: AiSettings): NormalizedAiModelSettings {
  const normalized = normalizeAiSettings(settings);
  const provider = selectActiveProvider(normalized);
  return provider.models.find((model) => model.id === normalized.activeModelId) ?? provider.models[0];
}

export function withAiSelection(settings: AiSettings, providerId: string, modelId: string): NormalizedAiSettings {
  return normalizeAiSettings({ ...settings, activeProviderId: providerId, activeModelId: modelId });
}

function normalizeProviders(settings?: AiSettings): readonly NormalizedAiProviderSettings[] {
  if (settings?.providers?.length) {
    return settings.providers.map((provider, index) => normalizeProvider(provider, index));
  }

  const legacyModel = settings?.model?.trim() ?? DEFAULT_TEXT_MODEL;
  const legacyModelSettings = {
    id: "text",
    model: legacyModel,
    contextTokenBudget: settings?.contextTokenBudget,
    supportsVision: settings?.supportsVision,
  } satisfies AiModelSettings;
  const textModel = normalizeModelSettings(settings?.textModel ?? legacyModelSettings, "text");
  const visionModel = normalizeModelSettings(settings?.visionModel ?? legacyVisionModel(legacyModelSettings), "vision");
  const models = deduplicateModels([textModel, visionModel]);

  return [{
    id: "default",
    name: providerName(settings?.endpoint),
    protocol: "openai-compatible",
    endpoint: normalizeAiEndpoint(settings?.endpoint ?? DEFAULT_AI_ENDPOINT),
    apiKey: settings?.apiKey ?? "",
    models,
    defaultModelId: models[0]?.id ?? "text",
  }];
}

export function selectTextModel(settings: AiSettings): AiModelSettings {
  return selectActiveModel(settings);
}

export function selectVisionModel(settings: AiSettings): AiModelSettings {
  return normalizeAiSettings(settings).visionModel;
}

export function normalizeAiEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/chat\/completions\/?$/, "");
}

function legacyVisionModel(model: AiModelSettings): AiModelSettings {
  if (model.supportsVision) return model;
  return { id: "vision", model: DEFAULT_VISION_MODEL, supportsVision: true };
}

function normalizeModelSettings(settings: AiModelSettings, fallbackId: string): NormalizedAiModelSettings {
  return {
    ...settings,
    id: settings.id?.trim() || fallbackId,
    name: settings.name?.trim() || undefined,
    model: settings.model.trim(),
  };
}

function normalizeProvider(provider: AiProviderSettings, index: number): NormalizedAiProviderSettings {
  const { enabled: legacyEnabled, ...providerFields } = provider as AiProviderSettings & { readonly enabled?: boolean };
  void legacyEnabled;
  const id = provider.id.trim() || `provider-${index + 1}`;
  const models = deduplicateModels(provider.models.map((model, modelIndex) => normalizeModelSettings(model, `model-${modelIndex + 1}`)));
  const defaultModelId = models.some((model) => model.id === provider.defaultModelId)
    ? provider.defaultModelId as string
    : models[0]?.id ?? "model-1";
  return {
    ...providerFields,
    id,
    name: provider.name.trim() || `提供商 ${index + 1}`,
    protocol: "openai-compatible",
    endpoint: normalizeAiEndpoint(provider.endpoint),
    models,
    defaultModelId,
  };
}

function deduplicateModels(models: readonly NormalizedAiModelSettings[]): readonly NormalizedAiModelSettings[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function selectConfiguredProvider(providers: readonly NormalizedAiProviderSettings[], providerId?: string): NormalizedAiProviderSettings {
  return providers.find((provider) => provider.id === providerId)
    ?? providers.find((provider) => provider.models.length > 0)
    ?? providers[0];
}

function selectConfiguredModel(provider: NormalizedAiProviderSettings, modelId?: string): NormalizedAiModelSettings {
  return provider.models.find((model) => model.id === modelId)
    ?? provider.models.find((model) => model.id === provider.defaultModelId)
    ?? provider.models[0]
    ?? normalizeModelSettings({ model: "" }, "model-1");
}

function normalizedSettings(
  settings: AiSettings | undefined,
  providers: readonly NormalizedAiProviderSettings[],
  activeProvider: NormalizedAiProviderSettings,
  activeModel: NormalizedAiModelSettings,
  visionModel: AiModelSettings,
): NormalizedAiSettings {
  return {
    ...settings,
    provider: "openai-compatible",
    endpoint: activeProvider.endpoint,
    apiKey: activeProvider.apiKey,
    providers,
    activeProviderId: activeProvider.id,
    activeModelId: activeModel.id,
    textModel: activeModel,
    visionModel,
    model: activeModel.model,
    contextTokenBudget: activeModel.contextTokenBudget,
    supportsVision: activeModel.supportsVision,
  };
}

function providerName(endpoint?: string): string {
  const normalized = normalizeAiEndpoint(endpoint ?? DEFAULT_AI_ENDPOINT);
  if (normalized.includes("openai.com")) return "OpenAI";
  if (normalized.includes("openrouter.ai")) return "OpenRouter";
  if (normalized.includes("deepseek.com")) return "DeepSeek";
  if (normalized.includes("generativelanguage.googleapis.com")) return "Google Gemini";
  return "自定义提供商";
}

function isKnownVisionModel(model: string): boolean {
  return /(?:gpt-4o|vision|\bvl\b|qwen.*vl|gemini|mimo-v2\.5(?!-pro)|grok-4\.)/i.test(model);
}