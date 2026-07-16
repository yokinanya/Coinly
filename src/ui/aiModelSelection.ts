import type { AiSettings, AppData } from "../domain/types";
import { defaultAiSettings, normalizeAiSettings, selectActiveModel, selectActiveProvider, withAiSelection } from "../ai/settings";

export interface SessionModelOption {
  readonly value: string;
  readonly label: string;
  readonly providerId: string;
  readonly providerName: string;
}

export function sessionModelOptions(settings: AiSettings): readonly SessionModelOption[] {
  const normalized = normalizeAiSettings(settings);
  return normalized.providers.flatMap((provider) => provider.models.flatMap((model) => model.model ? [{
    value: modelSelectionValue(provider.id, model.id),
    label: model.name || model.model,
    providerId: provider.id,
    providerName: provider.name,
  }] : []));
}

export function sessionDefaultSelectionValue(settings: AiSettings): string {
  const normalized = normalizeAiSettings(settings);
  const provider = selectActiveProvider(normalized);
  const model = provider.models.find((item) => item.id === provider.defaultModelId) ?? selectActiveModel(normalized);
  return modelSelectionValue(provider.id, model.id);
}

export function withSessionModel(data: AppData, selection: string): AppData {
  const settings = normalizeAiSettings(data.aiSettings ?? defaultAiSettings());
  const [providerId, modelId] = selection.split("::");
  return { ...data, aiSettings: withAiSelection(settings, providerId || settings.activeProviderId, modelId || settings.activeModelId) };
}

function modelSelectionValue(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}
